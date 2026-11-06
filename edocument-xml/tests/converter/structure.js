#!/usr/bin/env node
// The structure check of a French request (lib/request-check.js): the provider's own structure file must give no problem, and each kind of problem must be found.
"use strict";
const fs = require("fs"), path = require("path");
const { open } = require("../lib/engine");
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "base.json"), "utf8"));
const staging = path.join(__dirname, "..", ".cache", "provider-staging", "FR_STAGING_1.json");
const mk = (f) => { const x = JSON.parse(JSON.stringify(base)); f(x.req[0], x.req[0].InvoiceLineList[0]); return x; };
const cases = [
  ["the base request has only the gross price warning", base, [["warn", "LineItemGrossPrice"]]],
  ["with a zero discount entry nothing is left", mk((i, l) => { l.InvoiceLineItemList = [{ LineItemDiscount: "0.00" }]; }), []],
  ["a discount on the line, not in the list", mk((i, l) => { l.LineItemDiscount = "2.00"; l.InvoiceLineItemList = [{ LineItemDiscount: "2.00" }]; }), [["error", "LineItemDiscount"]]],
  ["a header field on the line", mk((i, l) => { l.BuyerReference = "X"; }), [["error", "BuyerReference"], ["warn", "LineItemGrossPrice"]]],
  ["a field with a wrong name", mk((i, l) => { l.LineItemNetPrise = "1"; l.InvoiceLineItemList = [{ LineItemDiscount: "0.00" }]; }), [["warn", "LineItemNetPrise"]]],
  ["a tab in a value", mk((i, l) => { l.ItemName = "Item\tone"; l.InvoiceLineItemList = [{ LineItemDiscount: "0.00" }]; }), [["error", "ItemName"]]],
  ["a line break in a value", mk((i, l) => { l.ItemDescription = "Item\none"; l.InvoiceLineItemList = [{ LineItemDiscount: "0.00" }]; }), [["error", "ItemDescription"]]],
  ["a number, not text", mk((i, l) => { l.LineQuantity = 5; l.InvoiceLineItemList = [{ LineItemDiscount: "0.00" }]; }), [["warn", "LineQuantity"]]],
  ["a list given as one object", mk((i, l) => { l.InvoiceLineItemList = { LineItemDiscount: "0.00" }; }), [["error", "InvoiceLineItemList"]]],
  ["a value given as a list", mk((i, l) => { l.ItemName = ["a"]; l.InvoiceLineItemList = [{ LineItemDiscount: "0.00" }]; }), [["error", "ItemName"]]],
];
(async () => {
  const e = await open();
  let bad = 0;
  const run = (input) => e.page.evaluate((i) => RequestCheck.check(i).map((m) => [m.level, m.key, m.path]), input);
  if (fs.existsSync(staging)) {
    const r = await run(JSON.parse(fs.readFileSync(staging, "utf8")));
    const ok = !r.length; if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + "the provider's own structure file gives no problem" + (ok ? "" : " " + JSON.stringify(r)));
  } else console.log("skip the provider's structure file is not in the cache");
  for (const [name, input, want] of cases) {
    const got = (await run(input)).map((m) => [m[0], m[1]]);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "\n       wanted " + JSON.stringify(want) + ", got " + JSON.stringify(got)));
  }
  await e.close();
  process.exit(bad ? 1 : 0);
})();
