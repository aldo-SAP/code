#!/usr/bin/env node
// Structural check: the viewer carries exactly the asserts of the official stylesheets of a profile, no more and no fewer.
// usage: check-rules.js PintAE|XRechnung IDS-FILE      (the ids of the official stylesheets, one per line)
"use strict";
const fs = require("fs");
const { open } = require("./lib/engine");
(async () => {
  const official = new Set(fs.readFileSync(process.argv[3], "utf8").split(/\s+/).filter((i) => i && !["Codesmodel", "Codesmodelaligned", "UBL-model", "UBL-modelaligned", "xrechnung-model"].includes(i) && !/-pattern(-\d+)?$/.test(i)));
  const eng = await open();
  const mine = new Set(await eng.page.evaluate((g) => (window[g] ? window[g].ids : []), process.argv[2]));
  await eng.close();
  const missing = [...official].filter((i) => !mine.has(i)), extra = [...mine].filter((i) => !official.has(i));
  console.log(`${official.size} official asserts, ${mine.size} in the viewer; missing: ${missing.length ? missing.join(", ") : "none"}; extra: ${extra.length ? extra.join(", ") : "none"}`);
  process.exit(missing.length || extra.length || !mine.size ? 1 : 0);
})();
