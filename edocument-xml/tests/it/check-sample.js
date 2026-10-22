#!/usr/bin/env node
// The Italian example of the viewer (countries/it/sample.js) must pass every check of every layer: the schema, the specification rules and the SdI controls.
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<html></html>");
  for (const f of ["countries/it/sample.js", "rules/it-schema-data.js", "rules/it-schema.js", "rules/it-spec.js", "rules/it-sdi.js"]) await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8") });
  const found = await p.evaluate(() => {
    const d = new DOMParser().parseFromString(window.IT_SAMPLE_XML, "application/xml"), r = d.documentElement;
    return [].concat(ItSchema.check(r), ItSpec.check(r), ItSdi.check(r, { name: "IT10203040506_00007.xml" })).map((f) => f.kind + " " + f.detail);
  });
  await b.close();
  console.log(found.length ? "the example has problems:\n  " + found.join("\n  ") : "ok   the example passes the schema, the specification rules and the SdI controls");
  process.exit(found.length ? 1 : 0);
})();
