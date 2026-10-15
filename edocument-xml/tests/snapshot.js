// Regression snapshot of the viewer: loads the samples and a few documents, in English and Italian, and writes the rendered page text and HTML.
// usage: snapshot.js OUTFILE [XML-DIR…]   (compare two runs with diff: a refactoring must not change them)
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
(async () => {
  const [out, ...dirs] = process.argv.slice(2);
  const docs = [["sample", "#sampleBtn"], ["uae-sample", "#aeSampleBtn"]];
  const files = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".xml")).sort().slice(0, 6).map((f) => path.join(d, f)));
  const browser = await chromium.launch();
  const res = {};
  const errors = [];
  for (const lang of ["en", "it"]) {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((l) => { try { localStorage.setItem("edocxml.lang", l); } catch (e) {} }, lang);
    await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
    const grab = async (key) => {
      await page.waitForSelector("#verdict *");
      res[lang + ":" + key] = { verdict: await page.innerHTML("#verdict"), hero: await page.innerHTML("#hero"), content: await page.innerHTML("#content"), raw: await page.innerHTML("#rawXml") };
    };
    for (const [key, btn] of docs) { await page.click("#clearBtn").catch(() => {}); await page.click(btn); await grab(key); }
    for (const f of files) {
      await page.click("#clearBtn").catch(() => {});
      await page.setInputFiles("#file", f);
      await page.waitForTimeout(150);
      await grab(path.basename(f));
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(Object.keys(res).length + " snapshots, " + errors.length + " page errors" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));
})();
