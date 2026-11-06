/*
 * The structure of a French request, checked against the structure the platform provider gave (lib/request-structure-fr.js, names only): is every field where the
 * provider has it, and is every value something the platform can read? It does not look at the values themselves (the amounts, the codes: those are what the XML
 * checks are for), only at the shape. What each problem means was learned from the platform's own answers; the ones that are confirmed say so.
 *
 * RequestCheck.check(parsedInput) -> [{ level: "error" | "warn", path, key, message }]  ([] for a request that is not in this format)
 */
(function () {
  "use strict";
  const S = () => window.REQUEST_STRUCTURE_FR;
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  // fields the platform reads somewhere other than where an older template put them (confirmed by the platform's results)
  const MOVED = { LineItemDiscount: "InvoiceLineList/InvoiceLineItemList" };

  // where each field is in the provider's structure: field name -> ["Level/List", …]
  function index(level, here, map) {
    level.keys.forEach((k) => { (map[k] = map[k] || []).push(here); });
    Object.keys(level.lists).forEach((l) => { (map[l] = map[l] || []).push(here); index(level.lists[l], here === "request" ? l : here + "/" + l, map); });
    return map;
  }
  let where = null;

  function check(input) {
    const out = [];
    if (!S() || !isObj(input) || !Array.isArray(input.req)) return out;
    if (!where) where = index(S(), "request", {});
    const add = (level, path, key, message) => out.push({ level, path, key, message });
    const home = (key) => where[key] || [];

    function value(path, key, v) {
      if (v === null) { add("warn", path, key, "The value is null; the provider's structure has all values as text."); return; }
      if (typeof v === "number") { add("warn", path, key, "The value is a number, not text; the provider's structure has all values as text."); return; }
      if (typeof v === "boolean") { add("warn", path, key, "The value is true or false, not text; the provider's structure has all values as text."); return; }
      if (typeof v === "string" && /[\u0000-\u001F\u007F]/.test(v)) add("error", path, key, "The value has a tab, a line break or another control character; the platform refuses a file where a value has one.");
      if (typeof v === "string" && /^\s|\s$/.test(v) && v.trim() !== "") add("warn", path, key, "The value starts or ends with a space.");
    }
    function walk(obj, ref, here, path) {
      Object.keys(obj).forEach((key) => {
        const v = obj[key], p = path + "." + key;
        if (ref.lists[key]) {
          if (!Array.isArray(v)) { add("error", p, key, "This must be a list of entries, here it is not."); return; }
          v.forEach((row, i) => {
            if (!isObj(row)) { add("error", p + "[" + i + "]", key, "Every entry of this list must be an object."); return; }
            walk(row, ref.lists[key], here === "request" ? key : here + "/" + key, p + "[" + i + "]");
          });
          return;
        }
        if (ref.keys.indexOf(key) >= 0) {
          if (Array.isArray(v)) add("error", p, key, "This is a single value in the provider's structure, here it is a list.");
          else if (isObj(v)) add("error", p, key, "This is a single value in the provider's structure, here it is a group of fields.");
          else value(p, key, v);
          return;
        }
        // not a field of this level
        const elsewhere = home(key);
        const moved = MOVED[key];
        if (moved && here !== moved) add("error", p, key, "The platform reads this only inside " + moved.split("/").pop() + ", and ignores it here (confirmed by its results).");
        else if (elsewhere.length) add("error", p, key, "In the provider's structure this field is in " + elsewhere.map((h) => (h === "request" ? "the request itself" : h.split("/").pop())).join(" or ") + ", not here.");
        else add("warn", p, key, "The provider's structure has no field with this name here; check the spelling, or whether the platform accepts it.");
      });
    }

    input.req.forEach((inv, i) => {
      const path = "req[" + i + "]";
      if (!isObj(inv)) { add("error", path, "", "Every invoice of the request must be an object."); return; }
      walk(inv, S(), "request", path);
      // the gross price (BT-148) is written only with a discount entry: the platform does not write it alone (confirmed)
      (Array.isArray(inv.InvoiceLineList) ? inv.InvoiceLineList : []).forEach((ln, j) => {
        if (!isObj(ln)) return;
        if (ln.InvoiceLineItemList != null && !Array.isArray(ln.InvoiceLineItemList)) return;     // already reported as not a list
        const rows = Array.isArray(ln.InvoiceLineItemList) ? ln.InvoiceLineItemList : [];
        const hasDiscount = rows.some((r) => isObj(r) && r.LineItemDiscount != null && r.LineItemDiscount !== "");
        if (ln.LineItemGrossPrice != null && ln.LineItemGrossPrice !== "" && !hasDiscount)
          add("warn", path + ".InvoiceLineList[" + j + "].LineItemGrossPrice", "LineItemGrossPrice", "The gross price (BT-148) is only written when the line has a LineItemDiscount entry in InvoiceLineItemList (0.00 when there is no discount).");
      });
    });
    return out;
  }
  window.RequestCheck = { check };
})();
