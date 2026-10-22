/*
 * UAE (PINT AE): what the viewer shows for this format that the generic invoice view does not.
 * The rules are in rules.js, the Italian text in it.js, the example in sample.js.
 */
EdocProfiles.register(function (h) {
  "use strict";
  const { esc, txt, T } = h;
  // The 8 digits of the transaction type (BTAE-02) are flags, from the left: free trade zone, deemed supply, margin scheme,
  // summary invoice, continuous supply, disclosed agent billing, supply through e-commerce, exports
  const TXN_FLAGS = ["Free trade zone", "Deemed supply", "Margin scheme", "Summary invoice", "Continuous supply", "Disclosed agent billing", "Supply through e-commerce", "Exports"];
  const txnType = (v) => {
    if (!/^[01]{8}$/.test(v)) return esc(v);
    const on = TXN_FLAGS.filter((_, i) => v[i] === "1");
    return '<code class="txn">' + esc(v) + "</code> " + (on.length ? on.map((f) => '<span class="chip">' + esc(T(f)) + "</span>").join(" ") : '<span class="dec">' + esc(T("none of the special supplies")) + "</span>");
  };
  const ITEM_TYPES = { G: "Goods", S: "Service", B: "Goods and service" };
  return {
    id: "ae",
    detect: (R) => window.PintAE && window.PintAE.detect(R),
    docFields: [["ProfileExecutionID", "Transaction type", "BTAE-02", { fmt: (el) => txnType(txt(el)) }]],
    lineFields: [{
      after: "Item/CommodityClassification/ItemClassificationCode",
      rows: [
        ["Item/CommodityClassification/CommodityCode", "Item type", "BTAE-13", { fmt: (el) => esc(txt(el)) + (ITEM_TYPES[txt(el)] ? ' <span class="chip">' + esc(T(ITEM_TYPES[txt(el)])) + "</span>" : "") }],
        ["Item/CommodityClassification/NatureCode", "Type of goods or services", "BTAE-09"],
        ["Item/AdditionalItemIdentification/ID", "Service accounting code", "BTAE-17"]
      ]
    }],
    refLabels: { "InvoicePeriod/DescriptionCode": ["Frequency of billing", "BTAE-06"] },
    sample: window.AE_SAMPLE_XML ? { label: "UAE", title: "Try a UAE sample", file: "sample-uae-invoice.xml", xml: window.AE_SAMPLE_XML } : null
  };
});
