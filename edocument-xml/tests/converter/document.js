#!/usr/bin/env node
// The document request ({ document: [ … ] }) converter: the price discount and the order line reference of a line. All data is invented.
"use strict";
const { open } = require("../lib/engine");
const cases = [
  ["a 0 discount with a gross price is written", { itemNetPrice: "36.25", itemPriceDiscount: "0.00", itemGrossPrice: "36.25" },
    [["string(//cac:Price/cac:AllowanceCharge/cbc:Amount)", "0.00"], ["string(//cac:Price/cac:AllowanceCharge/cbc:BaseAmount)", "36.25"], ["count(//cac:Price/cac:AllowanceCharge)", "1"]]],
  ["a discount of 0 as a number is written too", { itemNetPrice: 36.25, itemPriceDiscount: 0, itemGrossPrice: 36.25 },
    [["string(//cac:Price/cac:AllowanceCharge/cbc:Amount)", "0"], ["count(//cac:Price/cac:AllowanceCharge)", "1"]]],
  ["a gross price without a discount field writes no price allowance", { itemNetPrice: "36.25", itemGrossPrice: "36.25" }, [["count(//cac:Price/cac:AllowanceCharge)", "0"]], "document[0].lines[0].itemGrossPrice"],
  ["an empty discount counts as not given", { itemNetPrice: "36.25", itemPriceDiscount: "", itemGrossPrice: "36.25" }, [["count(//cac:Price/cac:AllowanceCharge)", "0"]], "document[0].lines[0].itemGrossPrice"],
  ["a discount without a gross price is written when it is not 0", { itemNetPrice: "34.25", itemPriceDiscount: "2.00" },
    [["string(//cac:Price/cac:AllowanceCharge/cbc:Amount)", "2.00"], ["count(//cac:Price/cac:AllowanceCharge/cbc:BaseAmount)", "0"]]],
  ["a 0 discount without a gross price is not written", { itemNetPrice: "36.25", itemPriceDiscount: "0.00" }, [["count(//cac:Price/cac:AllowanceCharge)", "0"]]],
  ["the order line reference has its line id first", { refPOLineRef: "10", refPORef: "PO-1" },
    [["name(//cac:OrderLineReference/*[1])", "cbc:LineID"], ["string(//cac:OrderLineReference/cbc:LineID)", "10"], ["string(//cac:OrderLineReference/cac:OrderReference/cbc:ID)", "PO-1"]]],
  ["without refPOLineRef the order line reference is not written and the field is listed", { refPORef: "PO-1" },
    [["count(//cac:OrderLineReference)", "0"]], "document[0].lines[0].refPORef"]
];
(async () => {
  const e = await open(); let bad = 0;
  for (const [name, line, facts, listed] of cases) {
    const r = await e.page.evaluate(([line, facts]) => {
      const res = RequestDocument.convert({ document: [{ invTypeCode: "380", invCurrCode: "USD", invNum: "INV-1", lines: [Object.assign({ invLineID: "1", invoicedQty: "1", invoicedQtyUOM: "C62", invLineNetAmt: "36.25", itemName: "Item" }, line)] }] });
      const doc = new DOMParser().parseFromString(res.xml, "application/xml");
      const ns = { cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2", cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" };
      const got = facts.map(([xp]) => { const v = doc.evaluate(xp, doc, (p) => ns[p] || null, XPathResult.ANY_TYPE, null); return v.resultType === XPathResult.NUMBER_TYPE ? String(v.numberValue) : v.resultType === XPathResult.STRING_TYPE ? v.stringValue : ""; });
      return { got, notMapped: res.notMapped.map((x) => x.path) };
    }, [line, facts]);
    const problems = [];
    facts.forEach(([xp, want], i) => { if (r.got[i] !== want) problems.push(xp + ": wanted " + JSON.stringify(want) + ", got " + JSON.stringify(r.got[i])); });
    if (listed && !r.notMapped.includes(listed)) problems.push("should be listed as not placed: " + listed + " (listed: " + r.notMapped + ")");
    if (!listed && r.notMapped.some((x) => /refPORef|itemPriceDiscount|itemGrossPrice/.test(x))) problems.push("listed as not placed: " + r.notMapped);
    if (problems.length) bad++;
    console.log((problems.length ? "FAIL " : "ok   ") + name + (problems.length ? "\n       " + problems.join("\n       ") : ""));
  }
  await e.close();
  process.exit(bad ? 1 : 0);
})();
