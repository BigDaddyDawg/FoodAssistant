(function () {
  var CFG = window.LARDER_CONFIG || {};
  var ITEMS_KEY = "larder.items.v1";
  var OUTBOX_KEY = "larder.outbox.v1";

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function newId() {
    if (window.crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    var s = "";
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return (
      s.slice(0, 8) + "-" + s.slice(8, 12) + "-4" + s.slice(13, 16) +
      "-a" + s.slice(17, 20) + "-" + s.slice(20, 32)
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function configured() {
    return Boolean(CFG.url && CFG.anonKey && CFG.table);
  }

  function endpoint(query) {
    return String(CFG.url || "").replace(/\/$/, "") + "/rest/v1/" + CFG.table + (query || "");
  }

  function eventsEndpoint(query) {
    return String(CFG.url || "").replace(/\/$/, "") + "/rest/v1/" + (CFG.eventsTable || "food_item_events") + (query || "");
  }

  function authHeaders(extra) {
    var headers = {
      apikey: CFG.anonKey,
      Authorization: "Bearer " + CFG.anonKey,
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        headers[key] = extra[key];
      });
    }
    return headers;
  }

  function stepFor(status, code) {
    if (!writeJson(ITEMS_KEY, readJson(ITEMS_KEY, []))) {
      return "Left to do: allow this browser to save the list on the device. Storage is blocked.";
    }
    if (!configured() || code === "config") {
      return "Left to do: point config.js at the family database.";
    }
    if (code === "timeout" || code === "offline" || status === 0) {
      return "Left to do: connect this device to the internet and leave Larder open. It will share the list when the family database answers.";
    }
    if (status === 401 || status === 403) {
      return "Left to do: allow the public family key to read and write the food_items table. The database refused this device.";
    }
    if (status === 404) {
      return "Left to do: create the food_items table on the family database.";
    }
    if (status) {
      return "Left to do: the family database returned HTTP " + status + ". This device will keep the list and try again.";
    }
    return "Left to do: reach the family database. This device will keep the list and try again.";
  }

  function loadLocal() {
    var items = readJson(ITEMS_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveLocal(items) {
    writeJson(ITEMS_KEY, items);
  }

  function loadOutbox() {
    var box = readJson(OUTBOX_KEY, []);
    return Array.isArray(box) ? box : [];
  }

  function saveOutbox(box) {
    writeJson(OUTBOX_KEY, box);
  }

  function fraction(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 && n <= 1 ? n : 1;
  }

  function normalise(row) {
    return {
      id: row.id || null,
      client_id: row.client_id,
      name: row.name,
      location: row.location,
      quantity: row.quantity || "1",
      unit: row.unit || "",
      notes: row.notes || "",
      source: row.source === "receipt" ? "receipt" : "manual",
      left_fraction: fraction(row.left_fraction),
      opened_at: row.opened_at || null,
      added_at: row.added_at,
      used_at: row.used_at || null
    };
  }

  function applyFields(item, fields) {
    Object.keys(fields).forEach(function (key) { item[key] = fields[key]; });
  }

  function applyRemote(rows) {
    var byId = {};
    rows.forEach(function (row) {
      if (!row.client_id) return;
      byId[row.client_id] = normalise(row);
    });
    var box = loadOutbox();
    var pendingUpsert = {};
    box.forEach(function (op) {
      if (op.op === "upsert") pendingUpsert[op.client_id] = true;
    });
    loadLocal().forEach(function (item) {
      if (pendingUpsert[item.client_id] && !byId[item.client_id]) byId[item.client_id] = item;
    });
    box.forEach(function (op) {
      if (op.op === "patch" && byId[op.client_id]) applyFields(byId[op.client_id], op.fields);
      if (op.op === "use" && byId[op.client_id]) byId[op.client_id].used_at = op.used_at;
      if (op.op === "undo" && byId[op.client_id]) byId[op.client_id].used_at = null;
      if (op.op === "remove") delete byId[op.client_id];
    });
    var merged = Object.keys(byId).map(function (key) { return byId[key]; });
    saveLocal(merged);
    return merged;
  }

  function timeoutFetch(url, options, ms) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        var err = new Error("timeout");
        err.status = 0;
        err.code = "timeout";
        reject(err);
      }, ms);
      fetch(url, options).then(function (res) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res);
      }, function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var err = new Error("offline");
        err.status = 0;
        err.code = "offline";
        reject(err);
      });
    });
  }

  function httpError(status) {
    var err = new Error("http");
    err.status = status;
    err.code = "http";
    return err;
  }

  async function readServer() {
    var res = await timeoutFetch(
      endpoint("?select=id,client_id,name,location,quantity,unit,notes,source,left_fraction,opened_at,added_at,used_at&order=added_at.desc"),
      { headers: authHeaders(), cache: "no-store" },
      12000
    );
    if (!res.ok) throw httpError(res.status);
    var rows = await res.json();
    if (!Array.isArray(rows)) throw httpError(500);
    return rows;
  }

  async function sendOp(op) {
    var res;
    if (op.op === "upsert") {
      res = await timeoutFetch(endpoint("?on_conflict=client_id"), {
        method: "POST",
        headers: authHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({
          client_id: op.item.client_id,
          name: op.item.name,
          location: op.item.location,
          quantity: op.item.quantity,
          unit: op.item.unit,
          notes: op.item.notes,
          source: op.item.source,
          left_fraction: fraction(op.item.left_fraction),
          opened_at: op.item.opened_at || null,
          added_at: op.item.added_at,
          used_at: op.item.used_at
        })
      }, 12000);
    } else if (op.op === "patch") {
      res = await timeoutFetch(
        endpoint("?client_id=eq." + encodeURIComponent(op.client_id)),
        {
          method: "PATCH",
          headers: authHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify(op.fields)
        },
        12000
      );
    } else if (op.op === "event") {
      res = await timeoutFetch(
        eventsEndpoint("?on_conflict=client_id"),
        {
          method: "POST",
          headers: authHeaders({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
          body: JSON.stringify(op.event)
        },
        12000
      );
    } else if (op.op === "use" || op.op === "undo") {
      res = await timeoutFetch(
        endpoint("?client_id=eq." + encodeURIComponent(op.client_id)),
        {
          method: "PATCH",
          headers: authHeaders({ Prefer: "return=minimal" }),
          body: JSON.stringify({ used_at: op.op === "use" ? op.used_at : null })
        },
        12000
      );
    } else if (op.op === "remove") {
      res = await timeoutFetch(
        endpoint("?client_id=eq." + encodeURIComponent(op.client_id)),
        { method: "DELETE", headers: authHeaders({ Prefer: "return=minimal" }) },
        12000
      );
    } else {
      return;
    }
    if (!res.ok) throw httpError(res.status);
  }

  var flushing = null;

  function flush() {
    if (flushing) return flushing;
    flushing = flushNow().then(function (value) {
      flushing = null;
      return value;
    }, function (err) {
      flushing = null;
      throw err;
    });
    return flushing;
  }

  async function flushNow() {
    if (!configured()) {
      var missing = new Error("config");
      missing.status = 0;
      missing.code = "config";
      throw missing;
    }
    var box = loadOutbox();
    var keep = [];
    var failed = null;
    for (var i = 0; i < box.length; i++) {
      if (failed) {
        keep.push(box[i]);
        continue;
      }
      try {
        await sendOp(box[i]);
      } catch (err) {
        failed = err;
        keep.push(box[i]);
      }
    }
    saveOutbox(keep);
    if (failed) throw failed;
    return true;
  }

  async function refresh() {
    if (!configured()) {
      return { items: loadLocal(), source: "device", step: stepFor(0, "config"), syncedAt: null };
    }
    try {
      await flush();
      var rows = await readServer();
      return {
        items: applyRemote(rows),
        source: "family",
        step: null,
        syncedAt: Date.now()
      };
    } catch (err) {
      return {
        items: loadLocal(),
        source: "device",
        step: stepFor(err.status || 0, err.code || ""),
        syncedAt: null
      };
    }
  }

  function makeItem(fields) {
    return {
      id: null,
      client_id: newId(),
      name: String(fields.name || "").replace(/\s+/g, " ").trim(),
      location: fields.location,
      quantity: String(fields.quantity || "1").trim() || "1",
      unit: String(fields.unit || "").trim(),
      notes: String(fields.notes || "").trim(),
      source: fields.source === "receipt" ? "receipt" : "manual",
      left_fraction: fraction(fields.left_fraction),
      opened_at: fraction(fields.left_fraction) < 1 ? nowIso() : null,
      added_at: nowIso(),
      used_at: null
    };
  }

  function queueEvent(item, action) {
    var box = loadOutbox();
    box.push({
      op: "event",
      event: {
        client_id: newId(),
        item_client_id: item.client_id,
        name: item.name,
        location: item.location,
        action: action,
        quantity: item.used_at ? "0" : String(item.quantity || "1"),
        left_fraction: item.used_at ? 0 : fraction(item.left_fraction),
        at: nowIso()
      }
    });
    saveOutbox(box);
  }

  function findLocal(clientId) {
    var items = loadLocal();
    for (var i = 0; i < items.length; i++) {
      if (items[i].client_id === clientId) return items[i];
    }
    return null;
  }

  function wholeCount(item) {
    var text = String(item.quantity || "").trim();
    return /^\d+$/.test(text) ? parseInt(text, 10) : null;
  }

  function patchItem(clientId, fields, action) {
    var item = null;
    var items = loadLocal();
    items.forEach(function (row) {
      if (row.client_id === clientId) {
        applyFields(row, fields);
        item = row;
      }
    });
    saveLocal(items);
    if (!item) return refresh();
    var box = loadOutbox();
    box.push({ op: "patch", client_id: clientId, fields: fields });
    saveOutbox(box);
    queueEvent(item, action);
    return refresh();
  }

  /* choice: "bit", "one", "all", or the fraction left of the open one (0.75, 0.5, 0.25, 0.1). */
  function useItem(clientId, choice) {
    var item = findLocal(clientId);
    if (!item) return { before: null, done: refresh() };
    var before = {
      quantity: item.quantity,
      left_fraction: fraction(item.left_fraction),
      opened_at: item.opened_at || null,
      used_at: item.used_at || null
    };
    var now = nowIso();
    var fields;
    var action;
    var count = wholeCount(item);
    if (choice === "all") {
      fields = { used_at: now };
      action = "used_up";
    } else if (choice === "one" && count && count > 1) {
      fields = { quantity: String(count - 1), left_fraction: 1, opened_at: null };
      action = "used_one";
    } else if (choice === "bit") {
      fields = { left_fraction: before.left_fraction >= 1 ? 0.9 : before.left_fraction, opened_at: before.opened_at || now };
      action = "used_some";
    } else {
      fields = { left_fraction: fraction(choice), opened_at: before.opened_at || now };
      action = "used_some";
    }
    return { before: before, done: patchItem(clientId, fields, action) };
  }

  function restoreItem(clientId, before) {
    return patchItem(clientId, before, "put_back");
  }

  function remember(item) {
    var items = loadLocal();
    var found = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].client_id === item.client_id) {
        items[i] = item;
        found = true;
        break;
      }
    }
    if (!found) items.push(item);
    saveLocal(items);
    loadOutbox();
    var box = loadOutbox();
    box.push({ op: "upsert", client_id: item.client_id, item: item });
    saveOutbox(box);
  }

  function addItems(fieldsList) {
    var items = [];
    fieldsList.forEach(function (fields) {
      var item = makeItem(fields);
      if (!item.name) return;
      if (["fridge", "freezer", "cupboard"].indexOf(item.location) === -1) return;
      remember(item);
      queueEvent(item, "added");
      items.push(item);
    });
    return refresh().then(function (state) {
      state.added = items;
      return state;
    });
  }

  function undoUsed(clientId) {
    return patchItem(clientId, { used_at: null }, "put_back");
  }

  function removeItem(clientId) {
    var item = findLocal(clientId);
    if (item) queueEvent(item, "removed");
    saveLocal(loadLocal().filter(function (row) { return row.client_id !== clientId; }));
    var box = loadOutbox();
    box.push({ op: "remove", client_id: clientId });
    saveOutbox(box);
    return refresh();
  }

  window.LarderStore = {
    refresh: refresh,
    addItems: addItems,
    useItem: useItem,
    restoreItem: restoreItem,
    undoUsed: undoUsed,
    removeItem: removeItem,
    wholeCount: wholeCount,
    loadLocal: loadLocal
  };
})();
