(function () {
  var LOCATIONS = [
    { id: "fridge", label: "Fridge", empty: "Fridge is clear.", detail: "Cold food shows up here." },
    { id: "freezer", label: "Freezer", empty: "Freezer is clear.", detail: "Frozen food shows up here." },
    { id: "cupboard", label: "Cupboard", empty: "Cupboard is clear.", detail: "Tins, jars, and dry food show up here." }
  ];

  var board = document.getElementById("board");
  var countEl = document.getElementById("count");
  var banner = document.getElementById("banner");
  var statusEl = document.getElementById("status");
  var usedBox = document.getElementById("used");
  var toastEl = document.getElementById("toast");

  var pendingRemove = null;
  var pendingUse = null;
  var toastTimer = null;
  var busy = false;
  var sawServer = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function onHand(items) {
    return items.filter(function (item) { return !item.used_at; });
  }

  function recentUsed(items) {
    var cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return items.filter(function (item) {
      if (!item.used_at) return false;
      var time = new Date(item.used_at).getTime();
      return time && time >= cutoff;
    }).sort(function (a, b) {
      return new Date(b.used_at) - new Date(a.used_at);
    });
  }

  function whenLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var diff = Math.round((start - day) / 86400000);
    if (diff <= 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff < 7) return diff + " days ago";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return date.getDate() + " " + months[date.getMonth()];
  }

  var LEVELS = [
    { value: 0.75, label: "¾ left" },
    { value: 0.5, label: "½ left" },
    { value: 0.25, label: "¼ left" },
    { value: 0.1, label: "Nearly gone" }
  ];

  function level(item) {
    var n = Number(item.left_fraction);
    return isFinite(n) && n > 0 && n <= 1 ? n : 1;
  }

  function levelLabel(value) {
    if (value >= 1) return "";
    if (value >= 0.9) return "Opened";
    for (var i = 0; i < LEVELS.length; i++) {
      if (Math.abs(LEVELS[i].value - value) < 0.01) return LEVELS[i].label;
    }
    return Math.round(value * 100) + "% left";
  }

  function qtyLabel(item) {
    var quantity = String(item.quantity || "").trim();
    var unit = String(item.unit || "").trim();
    if ((!quantity || quantity === "1") && !unit) return "";
    return [quantity, unit].filter(Boolean).join(" ");
  }

  function metaLine(item) {
    var bits = [];
    var qty = qtyLabel(item);
    if (qty) bits.push(qty);
    var left = levelLabel(level(item));
    var count = LarderStore.wholeCount(item);
    if (left) bits.push(count && count > 1 ? "one open, " + left.toLowerCase() : left);
    var when = whenLabel(item.added_at);
    if (when) bits.push("added " + when);
    if (item.notes) bits.push(item.notes);
    return bits.join(" · ");
  }

  function sorted(list) {
    return list.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
  }

  function applyState(state) {
    if (state.source === "family") sawServer = true;
    render(state.items || [], state);
    showBanner(state.step);
    showStatus(state);
  }

  function showBanner(step) {
    if (!step) {
      banner.hidden = true;
      banner.innerHTML = "";
      return;
    }
    banner.hidden = false;
    banner.innerHTML =
      "<strong>Saved on this device only.</strong> " + esc(step) +
      ' <button type="button" id="retry">Check again</button>';
  }

  function showStatus(state) {
    if (state.source === "family") {
      statusEl.textContent = "Same list on every device · just now";
      return;
    }
    if (state.step) {
      statusEl.textContent = "Not on the family list yet";
      return;
    }
    statusEl.textContent = "Checking the family list…";
  }

  function render(items, state) {
    var hand = onHand(items);
    var used = recentUsed(items);
    var unknown = state.source !== "family" && !sawServer && !hand.length;
    var noun = hand.length === 1 ? "1 thing" : hand.length + " things";
    countEl.textContent = hand.length ? noun + " in the house" : (unknown ? "List not loaded" : "Nothing in the house");

    var lead = "";
    if (unknown) {
      lead = '<p class="lead">Nothing is saved on this device yet. The family list has not come through.</p>';
    } else if (!hand.length) {
      lead = '<p class="lead">The house list is empty. Add milk, bread, or whatever came home.</p>';
    }

    var jumps = '<nav class="jumps" aria-label="Places">' +
      LOCATIONS.map(function (place) {
        var n = hand.filter(function (item) { return item.location === place.id; }).length;
        return '<a href="#' + place.id + '">' + place.label + " " + n + "</a>";
      }).join("") +
      "</nav>";

    var columns = LOCATIONS.map(function (place) {
      var rows = sorted(hand.filter(function (item) { return item.location === place.id; }));
      var body;
      if (!rows.length) {
        body = '<p class="empty"><strong>' + (unknown ? "Not loaded" : esc(place.empty)) + "</strong> " +
          (unknown ? "Check again in a moment." : esc(place.detail)) + "</p>";
      } else {
        body = rows.map(function (item) {
          return itemCard(item);
        }).join("");
      }
      return '<section class="col col-' + place.id + '" id="' + place.id + '">' +
        '<header class="col-h"><h2>' + place.label + "</h2><b>" + rows.length + "</b></header>" +
        '<div class="col-body">' + body + "</div></section>";
    }).join("");

    var scrolls = {};
    Array.prototype.forEach.call(board.querySelectorAll(".col"), function (col) {
      var body = col.querySelector(".col-body");
      if (body) scrolls[col.id] = body.scrollTop;
    });
    board.innerHTML = lead + jumps + '<div class="columns">' + columns + "</div>";
    Object.keys(scrolls).forEach(function (id) {
      var body = document.querySelector("#" + id + " .col-body");
      if (body) body.scrollTop = scrolls[id];
    });

    if (!used.length) {
      usedBox.hidden = true;
      usedBox.innerHTML = "";
      return;
    }
    usedBox.hidden = false;
    usedBox.innerHTML = '<h2>Used lately</h2><div class="used-row">' + used.map(function (item) {
      return '<div class="used-chip"><span>' + esc(item.name) + "</span>" +
        '<button type="button" data-undo="' + esc(item.client_id) + '">Put back</button></div>';
    }).join("") + "</div>";
  }

  function gauge(value) {
    if (value >= 1) return "";
    var pct = Math.max(6, Math.round(value * 100));
    return '<div class="gauge" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
  }

  function useStrip(item) {
    var id = esc(item.client_id);
    var now = level(item);
    var count = LarderStore.wholeCount(item);
    var buttons = '<button type="button" class="gone" data-choice="all">All gone</button>';
    if (count && count > 1) {
      buttons += '<button type="button" class="gone" data-choice="one">Used 1 of ' + count + "</button>";
    }
    buttons += '<button type="button" data-choice="bit">A bit</button>';
    LEVELS.forEach(function (step) {
      if (step.value < now - 0.01) {
        buttons += '<button type="button" data-choice="' + step.value + '">' + step.label + "</button>";
      }
    });
    return '<div class="use-strip" data-strip="' + id + '">' +
      '<p class="use-q">How much is left?</p>' +
      '<div class="use-choices">' + buttons + "</div>" +
      '<button type="button" class="texty" data-cancel-use>Not now</button>' +
      '<button type="button" class="texty" data-remove="' + id + '">Added by mistake</button></div>';
  }

  function itemCard(item) {
    var id = esc(item.client_id);
    var extra = "";
    if (pendingRemove === item.client_id) {
      extra = '<div class="confirm"><span>Take ' + esc(item.name) + " off the list?</span>" +
        '<button type="button" data-confirm-remove="' + id + '">Yes, remove</button>' +
        '<button type="button" data-cancel-remove>Keep it</button></div>';
    }
    var meta = metaLine(item);
    var open = pendingUse === item.client_id;
    var value = level(item);
    return '<article class="item' + (open ? " is-using" : "") + (value < 1 ? " is-open" : "") + '">' +
      '<div class="item-main"><h3>' + esc(item.name) + "</h3>" +
      (meta ? '<p class="meta">' + esc(meta) + "</p>" : "") +
      gauge(value) + extra + "</div>" +
      '<button type="button" class="used-btn" data-used="' + id + '" aria-expanded="' + (open ? "true" : "false") + '">' +
      (open ? "Close" : "Used") + "</button>" +
      (open ? useStrip(item) : "") + "</article>";
  }

  function showToast(message, undo) {
    toastEl.hidden = false;
    toastEl.innerHTML = "<span>" + esc(message) + "</span>" +
      '<button type="button" id="toast-undo">Undo</button>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 8000);
    document.getElementById("toast-undo").onclick = function () {
      toastEl.hidden = true;
      run(undo);
    };
  }

  function choiceMessage(item, choice) {
    if (choice === "all") return item.name + " is used up.";
    if (choice === "one") return item.name + ": 1 used, " + (LarderStore.wholeCount(item) - 1) + " left.";
    if (choice === "bit") return item.name + ": some used.";
    return item.name + ": " + levelLabel(Number(choice)).toLowerCase() + ".";
  }

  function run(action) {
    if (busy) return;
    busy = true;
    var pending = action();
    render(LarderStore.loadLocal(), { source: sawServer ? "family" : "device" });
    pending.then(function (state) {
      busy = false;
      applyState(state);
    }, function () {
      busy = false;
      reload();
    });
  }

  function reload() {
    statusEl.textContent = "Checking the family list…";
    return LarderStore.refresh().then(applyState, function () {
      applyState({
        items: LarderStore.loadLocal(),
        source: "device",
        step: "Left to do: reach the family database. This device will keep the list and try again.",
        syncedAt: null
      });
    });
  }

  board.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var used = target.closest("[data-used]");
    var choice = target.closest("[data-choice]");
    var cancelUse = target.closest("[data-cancel-use]");
    var remove = target.closest("[data-remove]");
    var confirm = target.closest("[data-confirm-remove]");
    var cancel = target.closest("[data-cancel-remove]");
    if (used) {
      var openId = used.getAttribute("data-used");
      pendingRemove = null;
      pendingUse = pendingUse === openId ? null : openId;
      render(LarderStore.loadLocal(), { source: sawServer ? "family" : "device" });
      var opened = board.querySelector(".is-using");
      if (opened && opened.scrollIntoView) opened.scrollIntoView({ block: "nearest" });
      return;
    }
    if (cancelUse) {
      pendingUse = null;
      render(LarderStore.loadLocal(), { source: sawServer ? "family" : "device" });
      return;
    }
    if (choice) {
      if (busy) return;
      var strip = choice.closest("[data-strip]");
      var clientId = strip.getAttribute("data-strip");
      var picked = choice.getAttribute("data-choice");
      var item = null;
      LarderStore.loadLocal().forEach(function (row) {
        if (row.client_id === clientId) item = row;
      });
      if (!item) return;
      pendingUse = null;
      var message = choiceMessage(item, picked);
      var result = LarderStore.useItem(clientId, picked === "all" || picked === "one" || picked === "bit" ? picked : Number(picked));
      run(function () { return result.done; });
      if (result.before) {
        showToast(message, function () { return LarderStore.restoreItem(clientId, result.before); });
      }
      return;
    }
    if (remove) {
      pendingRemove = remove.getAttribute("data-remove");
      pendingUse = null;
      render(LarderStore.loadLocal(), { source: sawServer ? "family" : "device" });
      return;
    }
    if (confirm) {
      var id = confirm.getAttribute("data-confirm-remove");
      pendingRemove = null;
      run(function () { return LarderStore.removeItem(id); });
      return;
    }
    if (cancel) {
      pendingRemove = null;
      render(LarderStore.loadLocal(), { source: sawServer ? "family" : "device" });
    }
  });

  usedBox.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var undo = target.closest("[data-undo]");
    if (!undo) return;
    toastEl.hidden = true;
    run(function () { return LarderStore.undoUsed(undo.getAttribute("data-undo")); });
  });

  banner.addEventListener("click", function (event) {
    if (event.target && event.target.id === "retry") reload();
  });

  var cached = LarderStore.loadLocal();
  if (cached.length) {
    render(cached, { source: "device" });
    statusEl.textContent = "Checking the family list…";
  }
  reload();
  setInterval(reload, 20000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }
})();
