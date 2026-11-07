(function (root) {
  var SHOP = /^(tesco|sainsburys|sainsbury's|asda|lidl|aldi|morrisons|waitrose|co-op|coop|iceland|spar|nisa|costcutter|budgens|ocado|receipt|welcome|customer|store|mid|tid|auth|approval)$/i;

  function skipReason(line) {
    if (line.length < 2) return "short";
    if (SHOP.test(line)) return "shop";
    if (/^\d[\d\s-]{7,}$/.test(line)) return "barcode";
    if (/^[£$€]?\s*\d+[.,]\d{2}\s*$/.test(line)) return "price";
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(line)) return "date";
    if (/^\d{1,2}:\d{2}\b/.test(line)) return "time";
    if (/\b(www\.|https?:|@)\b/i.test(line)) return "contact";
    if (/\b\d+\s+for\s+[£$€]/i.test(line)) return "offer";
    if (/^(tel|phone|vat|tax|change|cash|card|visa|mastercard|amex|debit|credit|total|sub\s?total|balance|paid|thank|points|savings|discount|refund|amount|store|branch|served|cashier|till|clubcard|nectar|more card|bonus|promotion|multibuy|you saved|price cut)\b/i.test(line)) {
      return "till";
    }
    if (/\b(total|subtotal|sub total|vat|amount due|balance due|change|cash|visa|mastercard|approval|clubcard|nectar|points|carrier bag|bag for life)\b/i.test(line)) {
      return "till";
    }
    if (/^\d+\s*@\s*[£$€]?\s*\d/.test(line)) return "multibuy";
    return "";
  }

  var PRICE_END = /\s[£$€]?\s*-?\d{1,4}[.,]\d{2}(?:\s*[A-Za-z*])?$/;

  function tidyName(name) {
    var letters = name.replace(/[^A-Za-z]/g, "");
    var uppers = name.replace(/[^A-Z]/g, "");
    if (!letters) return name;
    if (uppers.length / letters.length < 0.7) return name;
    return name.toLowerCase().replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); });
  }

  function parseItemLine(line) {
    var quantity = "1";
    var work = line;
    var qty = work.match(/^(\d+)\s*[x×]\s+(.+)$/i);
    if (qty) {
      quantity = String(parseInt(qty[1], 10));
      work = qty[2];
    }
    work = work.replace(/\s+[£$€]?\s*\d{1,4}[.,]\d{2}(?:\s*[A-Za-z])?$/, "");
    work = work.replace(/^\d{4,}\s+/, "");
    work = work.replace(/\s+/g, " ").replace(/[|*]+$/g, "").trim();
    if (!/[A-Za-z]/.test(work) || work.length < 2) return null;
    if (/^(total|vat|change|cash|card)$/i.test(work)) return null;
    return { name: tidyName(work), quantity: quantity, unit: "", source: "receipt" };
  }

  function parseReceipt(text) {
    var found = [];
    var skipped = 0;
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+/g, " ").trim();
      if (!line) return;
      if (skipReason(line)) {
        skipped += 1;
        return;
      }
      var item = parseItemLine(line);
      if (!item) {
        skipped += 1;
        return;
      }
      found.push({ item: item, priced: PRICE_END.test(line) });
    });
    var pricedCount = found.filter(function (row) { return row.priced; }).length;
    var items = [];
    found.forEach(function (row) {
      if (pricedCount >= 2 && !row.priced) {
        skipped += 1;
        return;
      }
      items.push(row.item);
    });
    if (items.length > 80) items = items.slice(0, 80);
    return { items: items, skipped: skipped };
  }

  root.parseReceipt = parseReceipt;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseReceipt: parseReceipt };
  }
})(typeof window !== "undefined" ? window : global);
