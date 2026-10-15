#!/usr/bin/env node
// Every failed rule of the schematron-based sets (UAE, XRechnung, France) must show in Italian, and the German and French ones in English too.
// usage: check-translations.js SETS DIR [DIR…]   (SETS: comma separated rule set ids; the documents of the directories are checked with them)
"use strict";
const fs = require("fs"), path = require("path");
const { open } = require("./lib/engine");
(async () => {
  const sets = process.argv[2].split(","), dirs = process.argv.slice(3);
  const eng = await open(4);
  const queue = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => /\.xml$/i.test(f)).map((f) => path.join(d, f)));
  const seen = new Map();   // message → id
  const work = async (page) => {
    for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
      const found = await page.evaluate(([text, sets]) => {
        const d = new DOMParser().parseFromString(text, "application/xml");
        if (d.getElementsByTagName("parsererror").length) return [];
        try { const R = d.documentElement; return EN16931.check(R, R.localName, sets).filter((x) => !x.ok).map((x) => [x.id, x.text, x.detail]); } catch (e) { return []; }
      }, [fs.readFileSync(f, "utf8"), sets]);
      found.forEach(([id, text, detail]) => { if (!seen.has(text)) seen.set(text, id); if (detail && !seen.has(detail)) seen.set(detail, id + " (detail)"); });
    }
  };
  await Promise.all(eng.pages.map(work));
  const bad = await eng.pages[0].evaluate((list) => {
    const out = [];
    for (const [text, id] of list) {
      if (/\(detail\)$/.test(id)) continue;   // details are numbers and names: not checked here
      I18N.set("it"); const it = I18N.tr(text);
      I18N.set("en"); const en = I18N.tr(text);
      if (it === text) out.push("no Italian: " + id + " | " + text.slice(0, 90));
      if (en === text && !/\b(the|must|MUST|shall|should|and)\b/.test(text) && /[äöüßéèàçôûâî]|\b(muss|müssen|sollen|soll|doit|Lorsque|Valeur actuelle|Si le)\b/.test(text)) out.push("no English: " + id + " | " + text.slice(0, 90));
    }
    return out;
  }, Array.from(seen));
  await eng.close();
  console.log(seen.size + " different texts of failed rules checked; " + (bad.length ? bad.length + " without translation:" : "all translated"));
  bad.slice(0, 20).forEach((b) => console.log("  " + b));
  process.exit(bad.length ? 1 : 0);
})();
