// Opens the viewer in headless Chromium and runs its rule engine on XML text.
// Needs Playwright (npm i -g playwright, or set PLAYWRIGHT_BROWSERS_PATH); no server is needed, the page is loaded from disk.
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const PAGE = "file://" + path.resolve(__dirname, "..", "..", "index.html");

async function open() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForFunction(() => window.EN16931 && window.EN16931.sets);
  return { browser, page, errors, close: () => browser.close() };
}

// Runs the rules on one document. sets: null = the sets the document asks for, or an array of rule-set ids.
// Returns { err } or { sets, fails: [id…], warns: [id…], details: {id: text} }.
function checkInPage([text, sets]) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return { err: "parse" };
  const root = doc.documentElement;
  if (!["Invoice", "CreditNote"].includes(root.localName)) return { err: "not UBL " + root.localName };
  try {
    const use = sets || EN16931.detect(root);
    const res = EN16931.check(root, root.localName, use);
    const uniq = (l) => Array.from(new Set(l));
    return {
      sets: use,
      fails: uniq(res.filter((x) => !x.ok && !x.warn).map((x) => x.id)),
      warns: uniq(res.filter((x) => !x.ok && x.warn).map((x) => x.id)),
      total: res.length,
    };
  } catch (e) { return { err: "CRASH " + e.message }; }
}

module.exports = { open, checkInPage };
