#!/usr/bin/env node
// Every message of every official rule set the viewer carries must show in Italian, and the German and French ones in English too.
"use strict";
const { open } = require("./lib/engine");
(async () => {
  const eng = await open();
  const bad = await eng.page.evaluate(() => {
    const sets = { "EN 16931": window.EN16931_RULES, Peppol: window.PEPPOL_RULES, "PINT AE": window.PINT_AE_RULES, XRechnung: window.XRECHNUNG_RULES, France: window.FR_RULES, "France ext": window.FR_EXT_RULES };
    const out = []; let total = 0;
    for (const [name, d] of Object.entries(sets)) {
      if (!d) { out.push(name + ": no data"); continue; }
      const seen = new Set();
      d.patterns.forEach((p) => p.r.forEach((r) => r.a.forEach((a) => {
        // a message as the engine shows it: <name/> and <value-of/> replaced by sample values
        const text = a[2].replace(/\u0001/g, "cbc:Name").replace(/\u0002[^\u0003]*\u0003/g, "x").replace(/\s+/g, " ").trim();
        if (seen.has(text)) return; seen.add(text); total++;
        I18N.set("it"); const it = I18N.tr(text, 0, true);   // strict: an exact translation or a pattern, no word-by-word
        I18N.set("en"); const en = I18N.tr(text, 0, true);
        if (it === null) out.push(name + " no Italian: " + a[0] + " | " + text.slice(0, 80));
        if (en === null && !/\b(the|must|MUST|shall|should|and|is|are)\b/.test(text) && /[äöüßéèàçôûâî]|\b(muss|doit|Lorsque|Si le)\b/.test(text)) out.push(name + " no English: " + a[0] + " | " + text.slice(0, 80));
      })));
    }
    // the UBL 2.1 structure rules (rules/ubl-schema.js): the six messages and one detail of each kind
    const ubl = ["Every element must be one that UBL 2.1 allows at that place, in the order UBL 2.1 gives (the business rules do not look at the order)", "Every element that UBL 2.1 requires must be present",
      "No element may occur more often than UBL 2.1 allows", "Every value must have the form of its UBL 2.1 type (number, date, true/false …)",
      "Every attribute UBL 2.1 requires must be present, and no other attribute may be used", "An element holds either a value or other elements, never both",
      "cbc:Foo is not allowed in cac:Party", "cbc:ID comes in the wrong place in Invoice: UBL 2.1 puts it before cbc:IssueDate", "cbc:ID comes in the wrong place in Invoice",
      "cbc:Note occurs more than 1 time in Invoice", "cbc:Note occurs more than 3 times in Invoice", "Invoice needs cbc:IssueDate", "cac:Party holds a value only, but contains the element cbc:Note",
      "cac:Party contains text, but only elements are allowed", "cbc:IssueDate: “2026-02-30” does not fit the type: date (YYYY-MM-DD)", "cbc:Amount/@currencyID: “x” does not fit the type: language code",
      "cbc:Amount has the attribute foo, which UBL 2.1 does not allow there", "cbc:Amount needs the attribute currencyID"];
    I18N.set("it"); ubl.forEach((t) => { total++; if (I18N.tr(t, 0, true) === null) out.push("UBL schema no Italian: " + t.slice(0, 90)); });
    out.push("TOTAL " + total);
    return out;
  });
  await eng.close();
  const total = bad.pop();
  console.log(total + " different messages checked; " + (bad.length ? bad.length + " without translation:" : "all translated"));
  bad.slice(0, 40).forEach((b) => console.log("  " + b));
  process.exit(bad.length ? 1 : 0);
})();
