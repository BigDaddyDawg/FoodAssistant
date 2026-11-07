(function () {
  var LOCATIONS = [
    { id: "fridge", label: "Fridge" },
    { id: "freezer", label: "Freezer" },
    { id: "cupboard", label: "Cupboard" }
  ];
  var UNITS = ["tin", "bag", "bottle", "box", "pack", "jar"];

  var form = document.getElementById("form");
  var nameInput = document.getElementById("name");
  var quantityInput = document.getElementById("quantity");
  var notesInput = document.getElementById("notes");
  var formMsg = document.getElementById("form-msg");
  var places = document.getElementById("places");
  var units = document.getElementById("units");
  var banner = document.getElementById("banner");
  var fileInput = document.getElementById("file");
  var scanButton = document.getElementById("scan");
  var scanStatus = document.getElementById("scan-status");
  var review = document.getElementById("review");

  var location = "";
  var unit = "";
  var saving = false;
  var draft = [];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function showBanner(step) {
    if (!step) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    banner.hidden = false;
    banner.textContent = "Saved on this device only. " + step;
  }

  function placeButtons(selected, attr) {
    return LOCATIONS.map(function (place) {
      var on = selected === place.id;
      return '<button type="button" class="place place-' + place.id + '" data-' + attr + '="' + place.id + '" aria-pressed="' + (on ? "true" : "false") + '">' + place.label + "</button>";
    }).join("");
  }

  places.innerHTML = placeButtons("", "pick");
  units.innerHTML = UNITS.map(function (name) {
    return '<button type="button" class="unit" data-unit="' + name + '" aria-pressed="false">' + name.charAt(0).toUpperCase() + name.slice(1) + "</button>";
  }).join("");

  places.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-pick]") : null;
    if (!button) return;
    location = button.getAttribute("data-pick");
    Array.prototype.forEach.call(places.querySelectorAll("[data-pick]"), function (el) {
      el.setAttribute("aria-pressed", el === button ? "true" : "false");
    });
  });

  var FILLS = [
    { value: 1, label: "Full" },
    { value: 0.75, label: "¾" },
    { value: 0.5, label: "½" },
    { value: 0.25, label: "¼" }
  ];
  var fillBox = document.getElementById("fill");
  var fill = 1;

  function drawFill() {
    fillBox.innerHTML = FILLS.map(function (step) {
      return '<button type="button" class="unit" data-fill="' + step.value + '" aria-pressed="' + (step.value === fill ? "true" : "false") + '">' + step.label + "</button>";
    }).join("");
  }
  drawFill();

  fillBox.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-fill]") : null;
    if (!button) return;
    fill = Number(button.getAttribute("data-fill"));
    drawFill();
  });

  units.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-unit]") : null;
    if (!button) return;
    var next = button.getAttribute("data-unit");
    unit = unit === next ? "" : next;
    Array.prototype.forEach.call(units.querySelectorAll("[data-unit]"), function (el) {
      el.setAttribute("aria-pressed", el.getAttribute("data-unit") === unit ? "true" : "false");
    });
  });

  document.getElementById("minus").addEventListener("click", function () {
    var n = parseInt(quantityInput.value, 10);
    if (!isNaN(n) && n > 1) quantityInput.value = String(n - 1);
  });
  document.getElementById("plus").addEventListener("click", function () {
    var n = parseInt(quantityInput.value, 10);
    quantityInput.value = String(isNaN(n) ? 2 : n + 1);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (saving) return;
    var name = nameInput.value.replace(/\s+/g, " ").trim();
    if (!name) {
      formMsg.textContent = "Type what it is.";
      nameInput.focus();
      return;
    }
    if (!location) {
      formMsg.textContent = "Choose fridge, freezer, or cupboard.";
      return;
    }
    saving = true;
    formMsg.textContent = "Putting it away…";
    LarderStore.addItems([{
      name: name,
      location: location,
      quantity: quantityInput.value,
      unit: unit,
      notes: notesInput.value,
      left_fraction: fill,
      source: "manual"
    }]).then(function (state) {
      saving = false;
      showBanner(state.step);
      if (!state.added || !state.added.length) {
        formMsg.textContent = "That one did not save. Check the name and the place.";
        return;
      }
      var place = LOCATIONS.filter(function (item) { return item.id === location; })[0];
      formMsg.textContent = name + " is in the " + place.label.toLowerCase() + ".";
      nameInput.value = "";
      notesInput.value = "";
      quantityInput.value = "1";
      fill = 1;
      drawFill();
      nameInput.focus();
    }, function () {
      saving = false;
      formMsg.textContent = "That one stayed on this device only. Check again from the list.";
    });
  });

  function setRowLocation(index, place) {
    draft[index].location = place;
    var row = review.querySelector('[data-row="' + index + '"]');
    if (!row) return;
    Array.prototype.forEach.call(row.querySelectorAll("[data-row-place]"), function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-row-place") === place ? "true" : "false");
    });
  }

  function renderReview(parsed) {
    draft = parsed.items.map(function (item) {
      return {
        name: item.name,
        quantity: item.quantity || "1",
        location: "",
        keep: true
      };
    });
    if (!draft.length) {
      review.innerHTML = '<p class="form-msg">No food lines stood out. Type them in below, one at a time.</p>';
      return;
    }
    var html = '<p class="form-msg">Found ' + draft.length + (draft.length === 1 ? " line." : " lines.") + " Untick anything that is not food.</p>";
    if (parsed.skipped) {
      html += '<p class="quiet">Left out ' + parsed.skipped + " lines that looked like the shop, the date, or the total.</p>";
    }
    html += '<div class="bulk">' +
      '<button type="button" data-bulk="fridge">All in the fridge</button>' +
      '<button type="button" data-bulk="freezer">All in the freezer</button>' +
      '<button type="button" data-bulk="cupboard">All in the cupboard</button></div>';
    html += draft.map(function (item, index) {
      return '<article class="review-row" data-row="' + index + '">' +
        '<label class="tickline"><input type="checkbox" data-keep="' + index + '" checked> <span>Keep</span></label>' +
        '<input class="line-name" type="text" maxlength="120" data-name="' + index + '" value="' + esc(item.name) + '">' +
        '<label class="line-qty">Qty <input type="text" maxlength="40" data-qty="' + index + '" value="' + esc(item.quantity) + '"></label>' +
        '<div class="places mini">' + placeButtons("", "row-place") + "</div></article>";
    }).join("");
    html += '<button type="button" class="primary" id="commit-receipt">Put the ticked ones away</button>';
    review.innerHTML = html;
  }

  review.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var bulk = target.closest("[data-bulk]");
    if (bulk) {
      var place = bulk.getAttribute("data-bulk");
      draft.forEach(function (_, index) { setRowLocation(index, place); });
      return;
    }
    var rowPlace = target.closest("[data-row-place]");
    if (rowPlace) {
      var row = rowPlace.closest("[data-row]");
      setRowLocation(Number(row.getAttribute("data-row")), rowPlace.getAttribute("data-row-place"));
      return;
    }
    if (target.id === "commit-receipt" || (target.closest && target.closest("#commit-receipt"))) {
      commitReceipt();
    }
  });

  review.addEventListener("input", function (event) {
    var target = event.target;
    if (target.hasAttribute("data-name")) {
      draft[Number(target.getAttribute("data-name"))].name = target.value;
    }
    if (target.hasAttribute("data-qty")) {
      draft[Number(target.getAttribute("data-qty"))].quantity = target.value;
    }
  });

  review.addEventListener("change", function (event) {
    var target = event.target;
    if (target.hasAttribute("data-keep")) {
      draft[Number(target.getAttribute("data-keep"))].keep = target.checked;
    }
  });

  function commitReceipt() {
    if (saving) return;
    var chosen = draft.filter(function (item) { return item.keep && String(item.name || "").trim(); });
    if (!chosen.length) {
      scanStatus.textContent = "Tick at least one line to keep.";
      return;
    }
    var missing = chosen.filter(function (item) { return !item.location; })[0];
    if (missing) {
      scanStatus.textContent = "Choose a place for " + missing.name + ".";
      return;
    }
    saving = true;
    scanStatus.textContent = "Putting them away…";
    LarderStore.addItems(chosen.map(function (item) {
      return {
        name: item.name,
        location: item.location,
        quantity: item.quantity,
        unit: "",
        notes: "",
        source: "receipt"
      };
    })).then(function (state) {
      saving = false;
      showBanner(state.step);
      var n = state.added ? state.added.length : 0;
      scanStatus.textContent = n === 1 ? "1 item is on the list." : n + " items are on the list.";
      review.innerHTML = '<p class="after"><a class="add-link" href="index.html">Back to the list</a></p>';
      draft = [];
    }, function () {
      saving = false;
      scanStatus.textContent = "Could not finish that save. The lines are still here. Try again.";
    });
  }

  function shrinkImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1600;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("script")); };
      document.head.appendChild(script);
    });
  }

  function readWords(image) {
    if (typeof Tesseract.createWorker === "function") {
      return Tesseract.createWorker("eng").then(function (worker) {
        return worker.recognize(image).then(function (result) {
          return worker.terminate().then(function () {
            return result && result.data ? result.data.text : "";
          });
        });
      });
    }
    return Tesseract.recognize(image, "eng").then(function (result) {
      return result && result.data ? result.data.text : "";
    });
  }

  scanButton.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    scanStatus.textContent = "Reading the receipt… keep this page open.";
    review.innerHTML = "";
    shrinkImage(file).then(function (image) {
      return loadTesseract().then(function () {
        return readWords(image);
      });
    }).then(function (text) {
      var parsed = window.parseReceipt(text || "");
      if (!String(text || "").trim()) {
        scanStatus.textContent = "No words came off that photo. Take it flatter, or type the items below.";
      } else {
        scanStatus.textContent = "";
      }
      renderReview(parsed);
    }).catch(function (err) {
      if (err && err.message === "script") {
        scanStatus.textContent = "The receipt reader did not load. Type the items below. Left to do: open this page on the phone while it is online.";
        return;
      }
      scanStatus.textContent = "Could not read that photo. Type the items below.";
    });
  });

  LarderStore.refresh().then(function (state) {
    showBanner(state.step);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }
})();
