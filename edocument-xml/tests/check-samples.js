#!/usr/bin/env node
// The examples of the viewer (lib/sample.js and countries/*/sample.js, except Italy: see it/check-sample.js) must pass every rule of the sets they ask for, with no error and no warning.
"use strict";
const { open } = require("./lib/engine");
(async () => {
  const e = await open();
  let bad = 0;
  for (const [name, global, set] of [["French", "FR_SAMPLE_XML", "fr"], ["German", "DE_SAMPLE_XML", "de"], ["UAE", "AE_SAMPLE_XML", "ae"], ["generic", "EDOC_SAMPLE_XML", null]]) {
    const r = await e.page.evaluate((g) => {
      const R = new DOMParser().parseFromString(window[g], "application/xml").documentElement, sets = EN16931.detect(R);
      return { sets, fails: EN16931.check(R, R.localName, sets).filter((x) => !x.ok).map((x) => x.id) };
    }, global);
    const ok = (!set || r.sets.includes(set)) && !r.fails.length;
    if (!ok) bad++;
    console.log(ok ? "ok   the " + name + " example passes " + r.sets.join(" + ") : "FAIL the " + name + " example: sets " + r.sets + ", failing " + r.fails);
  }
  await e.close();
  process.exit(bad ? 1 : 0);
})();
