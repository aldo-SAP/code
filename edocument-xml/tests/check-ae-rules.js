#!/usr/bin/env node
// Structural check: the viewer carries exactly the asserts of the official PINT AE stylesheets, no more and no fewer.
// usage: check-ae-rules.js IDS-FILE      (the ids of both official stylesheets, one per line)
"use strict";
const fs = require("fs");
const { open } = require("./lib/engine");
(async () => {
  const official = new Set(fs.readFileSync(process.argv[2], "utf8").split(/\s+/).filter((i) => i && !["Codesmodel", "Codesmodelaligned", "UBL-model", "UBL-modelaligned"].includes(i)));
  const eng = await open();
  const mine = new Set(await eng.page.evaluate(() => (window.PintAE ? window.PintAE.ids : [])));
  await eng.close();
  const missing = [...official].filter((i) => !mine.has(i)), extra = [...mine].filter((i) => !official.has(i));
  console.log(`${official.size} official asserts, ${mine.size} in the viewer; missing: ${missing.length ? missing.join(", ") : "none"}; extra: ${extra.length ? extra.join(", ") : "none"}`);
  process.exit(missing.length || extra.length || !mine.size ? 1 : 0);
})();
