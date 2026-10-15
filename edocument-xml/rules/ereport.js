/*
 * E-reporting (Flux 10, transactions report 10.1) built from the UBL invoice.
 *
 * The French platforms turn the invoice into a Flux 10 report; this file does the same so that the report can be shown and
 * checked. The structure and the element order come from the official XSD (FNFE-MPE France_RFE, Flux10/xsd/transaction.xsd), the
 * source of every field from the annex XP Z12-012 v1.4, sheet "E-REPORTING - Flux 10" (column "ID BT Flux 2 / Flux 1").
 * The envelope (ReportDocument: transmission id, platform, declarer) is not in the invoice; it is filled with placeholders and
 * is not checked.
 *
 * EReport.build(root, kind) → { doc, xml }   doc is the report as a DOM document, xml its text.
 */
(function () {
  "use strict";
  const { byPath, first, val, txt } = EN16931.util;

  const date = (s) => (s || "").trim().replace(/-/g, "");   // 2026-10-14 → 20261014
  const isVat = (s) => val(s, "TaxScheme/ID").toUpperCase() === "VAT";
  const vatId = (party) => { const s = byPath(party, "PartyTaxScheme").find(isVat); return s ? first(s, "CompanyID") : null; };

  function build(R, kind) {
    const cn = kind === "CreditNote";
    const doc = document.implementation.createDocument(null, "Report");
    const src = new Map();   // report element → the UBL element it was built from, to point failures at the invoice
    // element with optional attributes and text or children; null when there is nothing to put in it
    const el = (name, text, attrs) => {
      const e = doc.createElementNS(null, name);
      if (text !== undefined && text !== null && text !== "") e.textContent = text;
      Object.keys(attrs || {}).forEach((k) => { if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "") e.setAttribute(k, attrs[k]); });
      return e;
    };
    // add children that exist; a container with no content is left out unless it is required
    const add = (parent, kids, keepEmpty) => { kids.filter(Boolean).forEach((k) => parent.appendChild(k)); return parent.childNodes.length || keepEmpty ? parent : null; };
    // leaf from a UBL element: text of the element, optional attributes read from it
    const from = (e, ubl) => { if (e && ubl) src.set(e, ubl); return e; };
    const leaf = (name, ubl, attrs) => (ubl && txt(ubl) !== "" ? from(el(name, txt(ubl), typeof attrs === "function" ? attrs(ubl) : attrs), ubl) : null);
    const leafDate = (name, ubl) => (ubl && txt(ubl) !== "" ? from(el(name, date(txt(ubl))), ubl) : null);

    const seller = first(R, "AccountingSupplierParty/Party"), buyer = first(R, "AccountingCustomerParty/Party"), rep = first(R, "TaxRepresentativeParty");
    const parties = [first(R, "ID")].filter(Boolean);
    void parties;

    // identifier of a party: legal registration first, then the other identifiers, as the annex lists them (BT-30, BT-29, BT-31 / BT-47, BT-46, BT-48)
    const company = (party, name, sources) => {
      for (const s of sources) {
        const e = s === "vat" ? vatId(party) : first(party, s);
        if (e && txt(e) !== "") return from(el(name, txt(e), { schemeId: s === "vat" ? "" : e.getAttribute("schemeID") }), e);
      }
      return null;
    };
    const taxId = (party, name) => { const e = vatId(party); return e ? from(el(name, txt(e), { qualifyingId: "VAT" }), e) : null; };

    const inv = el("Invoice");
    add(inv, [
      leaf("ID", first(R, "ID")), leafDate("IssueDate", first(R, "IssueDate")), leaf("TypeCode", first(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode")),
      leaf("CurrencyCode", first(R, "DocumentCurrencyCode")), leafDate("DueDate", first(R, "DueDate")), leaf("TaxDueDateTypeCode", first(R, "InvoicePeriod/DescriptionCode"))
    ]);
    // notes: "#CODE#text" gives the subject (BT-21) and the content (BT-22)
    byPath(R, "Note").forEach((n) => {
      const t = txt(n), m = /^#([A-Za-z0-9]{3})#([\s\S]*)$/.exec(t);
      add(inv, [add(el("IncludedNote"), [m ? from(el("Subject", m[1]), n) : null, from(el("Content", m ? m[2].trim() : t), n)])]);
    });
    add(inv, [add(el("BusinessProcess"), [leaf("ID", first(R, "ProfileID")), leaf("TypeID", first(R, "CustomizationID"))], true)]);
    byPath(R, "BillingReference").forEach((b) => {
      const d = first(b, "InvoiceDocumentReference");
      if (d) add(inv, [add(el("ReferencedDocument"), [leaf("ID", first(d, "ID")), leafDate("IssueDate", first(d, "IssueDate"))])]);
    });
    add(inv, [add(el("Seller"), [
      company(seller, "CompanyId", ["PartyLegalEntity/CompanyID", "PartyIdentification/ID", "vat"]), taxId(seller, "TaxRegistrationId"),
      add(el("PostalAddress"), [leaf("CountryId", first(seller, "PostalAddress/Country/IdentificationCode"))])
    ], true)]);
    if (buyer) add(inv, [add(el("Buyer"), [
      company(buyer, "CompanyId", ["PartyLegalEntity/CompanyID", "PartyIdentification/ID", "vat"]), taxId(buyer, "TaxRegistrationId"),
      add(el("PostalAddress"), [leaf("CountryId", first(buyer, "PostalAddress/Country/IdentificationCode"))])
    ])]);
    const repVat = rep ? vatId(rep) : null;
    if (repVat) add(inv, [add(el("SellerTaxRepresentative"), [from(el("TaxRegistrationId", txt(repVat), { schemeId: "VAT" }), repVat)])]);
    byPath(R, "Delivery").forEach((d) => {
      const a = first(d, "DeliveryLocation/Address");
      add(inv, [add(el("Delivery"), [
        leafDate("Date", first(d, "ActualDeliveryDate")),
        a ? add(el("Location"), [leaf("LineOne", first(a, "StreetName")), leaf("LineTwo", first(a, "AdditionalStreetName")), leaf("LineThree", first(a, "AddressLine/Line")),
          leaf("CityName", first(a, "CityName")), leaf("PostalZone", first(a, "PostalZone")), leaf("CountrySubentity", first(a, "CountrySubentity")),
          leaf("CountryId", first(a, "Country/IdentificationCode"))]) : null
      ])]);
    });
    const per = first(R, "InvoicePeriod");
    if (per) add(inv, [add(el("InvoicePeriod"), [leafDate("StartDate", first(per, "StartDate")), leafDate("EndDate", first(per, "EndDate"))])]);
    // allowances and charges of the document (BT-92…BT-96, BT-99…BT-103)
    byPath(R, "AllowanceCharge").forEach((a) => {
      const charge = /^(true|1)$/.test(val(a, "ChargeIndicator"));
      add(inv, [add(el("AllowanceCharge", "", { ChargeIndicator: charge ? "true" : "false" }), [
        leaf("Amount", first(a, "Amount")), leaf("TaxCategoryCode", first(a, "TaxCategory/ID")), leaf("TaxPercent", first(a, "TaxCategory/Percent"))])]);
    });
    // VAT total in euros: BT-110, or BT-111 when the invoice is in another currency (the report states the VAT in EUR)
    const totals = byPath(R, "TaxTotal"), eur = totals.map((t) => first(t, "TaxAmount")).find((a) => a && a.getAttribute("currencyID") === "EUR") || null;
    const vatAmount = eur || (totals.length ? first(totals[0], "TaxAmount") : null);
    add(inv, [add(el("MonetaryTotal"), [leaf("TaxExclusiveAmount", first(R, "LegalMonetaryTotal/TaxExclusiveAmount")),
      leaf("TaxAmount", vatAmount, (a) => ({ CurrencyCode: a.getAttribute("currencyID") }))], true)]);
    byPath(totals.find((t) => first(t, "TaxSubtotal")) || null, "TaxSubtotal").forEach((s) => {
      const c = first(s, "TaxCategory");
      add(inv, [add(el("TaxSubTotal"), [leaf("TaxableAmount", first(s, "TaxableAmount")), leaf("TaxAmount", first(s, "TaxAmount")),
        add(el("TaxCategory"), [leaf("Code", first(c, "ID")), leaf("Percent", first(c, "Percent")), leaf("TaxExemptionReason", first(c, "TaxExemptionReason")),
          leaf("TaxExemptionReasonCode", first(c, "TaxExemptionReasonCode"))], true)], true)]);
    });
    byPath(R, cn ? "CreditNoteLine" : "InvoiceLine").forEach((l) => {
      const q = first(l, cn ? "CreditedQuantity" : "InvoicedQuantity"), lp = first(l, "InvoicePeriod");
      const notes = byPath(l, "Note").map((n) => add(el("Note"), [el("Comment", txt(n))]));
      const acs = byPath(l, "AllowanceCharge").map((a) => add(el("AllowanceCharge", "", { ChargeIndicator: /^(true|1)$/.test(val(a, "ChargeIndicator")) ? "true" : "false" }), [leaf("Amount", first(a, "Amount"))]));
      const pa = first(l, "Price/AllowanceCharge");
      add(inv, [add(el("Line"), [].concat(notes, [
        leaf("BilledQuantity", q, (e) => ({ UnitCode: e.getAttribute("unitCode") })),
        lp ? add(el("InvoicePeriod"), [leafDate("StartDate", first(lp, "StartDate")), leafDate("EndDate", first(lp, "EndDate"))]) : null], acs, [
        add(el("Price"), [leaf("PriceAmount", first(l, "Price/PriceAmount")), leaf("AllowanceChargeAmount", pa ? first(pa, "Amount") : null),
          leaf("AllowanceChargeBaseAmount", pa ? first(pa, "BaseAmount") : null)]),
        add(el("Product"), [leaf("Name", first(l, "Item/Name"))])]), true)]);
    });

    // envelope: placeholders (the real values come from the platform)
    const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const report = doc.documentElement;
    add(report, [add(el("ReportDocument"), [
      el("Id", "REPORT-" + now), add(el("IssueDateTime"), [el("DateTimeString", now)]), el("TypeCode", "IN"),
      add(el("Sender"), [el("Id", "0000", { schemeId: "0238" }), el("Name", "PLATFORM"), el("RoleCode", "WK")]),
      add(el("Issuer"), [el("Id", "000000000", { schemeId: "0002" }), el("Name", "DECLARANT"), el("RoleCode", "SE")])
    ])]);
    // placeholder period: the issue date and the day after (the end must be later than the start)
    const d0 = new Date(Date.parse(val(R, "IssueDate").slice(0, 10) + "T00:00:00Z")), d1 = new Date(d0.getTime() + 86400000);
    const ymd = (d) => (isNaN(d) ? "" : d.toISOString().slice(0, 10).replace(/-/g, ""));
    const okPeriod = !isNaN(d0) && d0.getUTCFullYear() >= 2000 && d0.getUTCFullYear() < 2099;
    add(report, [add(el("TransactionsReport"), [add(el("ReportPeriod"), [el("StartDate", okPeriod ? ymd(d0) : "20260101"), el("EndDate", okPeriod ? ymd(d1) : "20260102")]), inv])]);
    return { doc, xml: pretty(doc), src };
  }

  // indented XML text
  function pretty(doc) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const attr = (s) => esc(s).replace(/"/g, "&quot;");
    const out = [];
    (function walk(e, d) {
      const pad = "  ".repeat(d), at = Array.from(e.attributes).map((a) => " " + a.name + '="' + attr(a.value) + '"').join("");
      const kids = Array.from(e.children);
      if (!kids.length) out.push(pad + "<" + e.localName + at + (e.textContent ? ">" + esc(e.textContent) + "</" + e.localName + ">" : "/>"));
      else { out.push(pad + "<" + e.localName + at + ">"); kids.forEach((k) => walk(k, d + 1)); out.push(pad + "</" + e.localName + ">"); }
    })(doc.documentElement, 0);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + out.join("\n") + "\n";
  }


  // ---------- Checks on the report (the invoice-level rules of the official Flux 10 schematron, v1.8) ----------
  const VAT_RATES = [0, 0.9, 1.05, 1.75, 2.1, 5.5, 7, 8.5, 9.2, 9.6, 10, 13, 19.6, 20, 20.6];
  const ID_TYPES = ["0002", "0223", "0227", "0228", "0229"];
  const kids = (e, name) => (e ? Array.from(e.children).filter((c) => c.localName === name) : []);
  const down = (e, path) => path.split("/").reduce((cur, n) => [].concat(...cur.map((c) => kids(c, n))), [e]);
  const num = (s) => (s !== "" && isFinite(Number(s)) ? Number(s) : NaN);
  const amount = (s, dec) => new RegExp("^-?\\d+(\\.\\d{1," + dec + "})?$").test(s) && s.replace(".", "").length <= 19;
  const positive = (s, dec) => new RegExp("^\\d+(\\.\\d{1," + dec + "})?$").test(s) && s.replace(".", "").length <= 19;
  const dateOk = (s) => /^\d{8}$/.test(s);
  const yearOk = (s) => !dateOk(s) || (+s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2099);

  function checkReport(res, rule, R) {
    const { doc, src } = res;
    const inv = down(doc.documentElement, "TransactionsReport/Invoice")[0];
    if (!inv) return;
    const at = (n) => { for (let e = n; e; e = e.parentElement) if (src.has(e)) return src.get(e); return R; };
    const V = (e) => (e ? e.textContent : "");
    // every node must pass; the failing ones are reported at the invoice field they came from
    const chk = (id, nodes, test, text) => {
      if (!nodes.length) return;
      const bad = nodes.filter((n) => !test(n));
      rule(id, (bad.length ? bad : nodes).map(at), !bad.length, text, bad.length ? "Value " + bad.slice(0, 3).map((n) => "“" + V(n) + "”").join(", ") : "");
    };
    const E = (path) => down(inv, path);
    const ctx = (path, cond) => E(path).filter(cond || (() => true));
    const typeCode = V(E("TypeCode")[0]), process = V(E("BusinessProcess/ID")[0]);

    chk("G1.01", E("TypeCode"), (n) => ["261", "380", "381", "384", "386", "389", "393", "396", "471", "472", "473", "500", "501", "502", "503"].includes(V(n)),
      "E-report: the invoice type code (BT-3) is not allowed (261, 380, 381, 384, 386, 389, 393, 396, 471, 472, 473, 500, 501, 502 or 503)");
    chk("G1.02", E("BusinessProcess/ID"), (n) => ["B1", "S1", "M1", "B2", "S2", "M2", "B4", "S4", "M4", "S5", "S6", "B7", "S7"].includes(V(n)),
      "E-report: the billing framework (BT-23) must be B1, S1, M1, B2, S2, M2, B4, S4, M4, S5, S6, B7 or S7");
    if (["B4", "S4", "M4"].includes(process) && ["386", "500", "503"].includes(typeCode))
      rule("G1.60", at(E("TypeCode")[0]), false, "E-report: down payment invoices (386, 500, 503) are not allowed with frameworks B4, S4 and M4");
    chk("S1.12", E("BusinessProcess/TypeID"), (n) => V(n) === "urn.cpro.gouv.fr:1p0:ereporting",
      "E-report: the specification identifier (BT-24) must be urn.cpro.gouv.fr:1p0:ereporting");
    // identifiers of invoices
    const ids = E("ID").concat(E("ReferencedDocument/ID"), E("Line/ReferencedDocument/ID"));
    chk("G1.05", ids, (n) => V(n).length <= 35 && !/^ | $/.test(V(n)) && !/ /.test(V(n)) && /^[a-zA-Z0-9 \-+_/]+$/.test(V(n)),
      "E-report: invoice numbers (BT-1, BT-25) must have at most 35 characters, no spaces, only letters, digits and + - _ /");
    // dates
    const dates = ["IssueDate", "DueDate", "ReferencedDocument/IssueDate", "Delivery/Date", "InvoicePeriod/StartDate", "InvoicePeriod/EndDate", "Line/InvoicePeriod/StartDate",
      "Line/InvoicePeriod/EndDate", "Line/ReferencedDocument/IssueDate"].map(E).reduce((x, y) => x.concat(y), []);
    chk("G1.09", dates, (n) => dateOk(V(n)), "E-report: dates must be written YYYYMMDD");
    chk("G1.36", dates, (n) => yearOk(V(n)), "E-report: the year of a date must be between 2000 and 2099");
    chk("P1.11", E("TaxDueDateTypeCode"), (n) => ["5", "29", "72", "3", "35", "432"].includes(V(n)), "E-report: the VAT due date code (BT-8) must be 5, 29, 72, 3, 35 or 432");
    chk("G6.21", E("TaxSubTotal/TaxCategory/TaxExemptionReasonCode").filter((n) => V(n) === "VATEX-FR-CNWVAT"), () => ["261", "381", "396"].includes(typeCode),
      "E-report: the exemption code VATEX-FR-CNWVAT is only for credit notes (261, 381, 396)");
    // preceding invoice references
    const refs = E("ReferencedDocument");
    if (["384", "471", "472", "473"].includes(typeCode))
      rule("G1.32", at(E("TypeCode")[0]), refs.length === 1 && refs[0] && kids(refs[0], "IssueDate").length > 0, "E-report: a corrective invoice must have one and only one preceding invoice reference, with its date");
    if (["261", "381", "396", "502", "503"].includes(typeCode)) {
      const lines = E("Line");
      const ok = (refs.length >= 1 && refs.every((r) => kids(r, "IssueDate").length)) || (lines.length && lines.every((l) => down(l, "ReferencedDocument/ID").length && down(l, "ReferencedDocument/IssueDate").length));
      rule("G1.32", at(E("TypeCode")[0]), !!ok, "E-report: a credit note must refer to the invoice it corrects, with its date (on the document or on every line)");
    }
    rule("G6.28", at(E("Buyer")[0] || E("TypeCode")[0]), E("Buyer/CompanyId").length > 0, "E-report: the buyer identifier (BT-47) is required for a B2B international transmission");
    // parties
    [["Seller", "seller", "BT-30"], ["Buyer", "buyer", "BT-47"]].forEach(([p, who, bt]) => {
      const c = E(p + "/CompanyId");
      chk("G2.19", c, (n) => ID_TYPES.includes(n.getAttribute("schemeId")), "E-report: the type (scheme) of the " + who + " identifier (" + bt + ") must be 0002, 0223, 0227, 0228 or 0229");
      chk("G2.19", c.filter((n) => ID_TYPES.includes(n.getAttribute("schemeId"))), (n) => {
        const s = n.getAttribute("schemeId"), v = V(n);
        return s === "0002" || s === "0229" ? /^\d{9}$/.test(v) : s === "0228" ? /^\d{9,10}$/.test(v) : v.length <= 18;
      }, "E-report: the " + who + " identifier (" + bt + ") has the wrong length or format for its type (0002 and 0229: 9 digits, 0228: 9 or 10 digits, 0223 and 0227: at most 18 characters)");
      E(p).filter((n) => down(n, "CompanyId").some((c2) => ["0002", "0223"].includes(c2.getAttribute("schemeId")))).forEach((n) =>
        rule("G2.33", at(down(n, "CompanyId")[0]), kids(n, "TaxRegistrationId").length > 0, "E-report: the " + who + " VAT identifier is required when the identifier type is 0002 or 0223"));
      chk("G2.33", E(p + "/TaxRegistrationId"), (n) => n.getAttribute("qualifyingId") === "VAT", "E-report: the " + who + " VAT identifier must be qualified “VAT”");
      chk("G2.01", E(p + "/PostalAddress/CountryId"), (n) => /^[A-Z]{2}$/.test(V(n)), "E-report: the " + who + " country code must be two capital letters (ISO 3166)");
    });
    if (E("TaxSubTotal/TaxCategory/Code").some((n) => V(n) === "E"))
      rule("G1.102", at(E("TaxSubTotal/TaxCategory/Code")[0]), E("Seller/TaxRegistrationId").length > 0 || E("SellerTaxRepresentative/TaxRegistrationId").length > 0,
        "E-report: the seller or tax representative VAT identifier is required when the VAT category is E");
    chk("G2.01", E("Delivery/Location/CountryId").concat(E("Line/Delivery/Location/CountryId")), (n) => /^[A-Z]{2}$/.test(V(n)), "E-report: delivery country codes must be two capital letters (ISO 3166)");
    // periods
    ["InvoicePeriod", "Line/InvoicePeriod"].forEach((p) => E(p).forEach((n) => {
      const s = V(kids(n, "StartDate")[0]), e = V(kids(n, "EndDate")[0]);
      if (s && e) rule("G6.25", at(n), e > s, "E-report: the end of a period must be after its start");
    }));
    // VAT categories, rates, amounts
    const cats = E("AllowanceCharge/TaxCategoryCode").concat(E("TaxSubTotal/TaxCategory/Code"));
    chk("G2.31", cats, (n) => ["S", "E", "AE", "K", "G", "O", "Z"].includes(V(n)), "E-report: VAT category codes must be S, E, AE, K, G, O or Z");
    chk("G1.24", E("AllowanceCharge/TaxPercent").concat(E("TaxSubTotal/TaxCategory/Percent")), (n) => VAT_RATES.includes(num(V(n))), "E-report: the VAT rate is not on the list of French rates");
    const money = E("AllowanceCharge/Amount").concat(E("MonetaryTotal/TaxExclusiveAmount"), E("MonetaryTotal/TaxAmount"), E("TaxSubTotal/TaxableAmount"), E("TaxSubTotal/TaxAmount"), E("Line/AllowanceCharge/Amount"));
    chk("G1.14", money, (n) => amount(V(n), 2), "E-report: amounts may have at most 2 decimals (separator “.”) and 19 characters");
    chk("G6.23", E("MonetaryTotal/TaxAmount"), (n) => n.getAttribute("CurrencyCode") === "EUR", "E-report: the VAT amount of the invoice must be in euros");
    chk("G1.15", E("Line/BilledQuantity"), (n) => amount(V(n), 4), "E-report: quantities may have at most 4 decimals (separator “.”)");
    chk("G1.16", E("Line/Price/PriceAmount").concat(E("Line/Price/AllowanceChargeAmount"), E("Line/Price/AllowanceChargeBaseAmount")), (n) => positive(V(n), 6),
      "E-report: unit prices may have at most 6 decimals, no minus sign");
    chk("G1.10", E("CurrencyCode"), (n) => /^[A-Z]{3}$/.test(V(n)), "E-report: the invoice currency must be three capital letters (ISO 4217)");
    E("TaxSubTotal").filter((n) => V(down(n, "TaxCategory/Code")[0]) === "E").forEach((n) =>
      rule("G1.40", at(n), down(n, "TaxCategory/TaxExemptionReasonCode").length > 0 && down(n, "TaxCategory/TaxExemptionReason").length > 0, "E-report: VAT category E needs an exemption reason code and text"));
    if (V(E("CurrencyCode")[0]) === "EUR") {
      const valid = (ns) => ns.every((n) => amount(V(n), 2)), sum = (ns) => ns.reduce((s, n) => s + num(V(n)), 0);
      const baseNodes = E("MonetaryTotal/TaxExclusiveAmount").concat(E("TaxSubTotal/TaxableAmount")), vatNodes = E("MonetaryTotal/TaxAmount").concat(E("TaxSubTotal/TaxAmount"));
      const tot = E("MonetaryTotal/TaxExclusiveAmount")[0], subs = E("TaxSubTotal/TaxableAmount");
      if (tot && valid(baseNodes)) rule("G1.53", at(tot), Math.abs(num(V(tot)) - sum(subs)) <= 0.01 * subs.length + 1e-9, "E-report: the total without VAT must equal the sum of the VAT breakdown bases (±0.01 each)");
      const vt = E("MonetaryTotal/TaxAmount")[0], vs = E("TaxSubTotal/TaxAmount");
      if (vt && valid(vatNodes)) rule("G1.53", at(vt), Math.abs(num(V(vt)) - sum(vs)) <= 0.01 * vs.length + 1e-9, "E-report: the invoice VAT amount must equal the sum of the VAT breakdown amounts (±0.01 each)");
    }
    E("Line/Price").filter((p) => kids(p, "PriceAmount").length && kids(p, "AllowanceChargeAmount").length && kids(p, "AllowanceChargeBaseAmount").length).forEach((p) => {
      const v = ["PriceAmount", "AllowanceChargeAmount", "AllowanceChargeBaseAmount"].map((n) => V(kids(p, n)[0]));
      if (v.every((x) => positive(x, 6))) rule("G1.55", at(p), Math.abs(num(v[0]) - (num(v[2]) - num(v[1]))) <= 0.01 + 1e-9, "E-report: the net price must equal the gross price minus the discount (±0.01)");
    });
  }

  // The report is built and checked when the file is an e-reporting invoice: a #BAR# note of B2BINT, B2C or B2CINT, or when the rule set is switched on.
  EN16931.register("ereport", {
    label: "E-reporting",
    name: "E-reporting (Flux 10)",
    detect: (R) => byPath(R, "Note").some((n) => /#BAR#\s*(B2BINT|B2C|B2CINT)\b/.test(txt(n))),
    run(c) { checkReport(build(c.R, c.cn ? "CreditNote" : "Invoice"), c.rule, c.R); }
  });

  window.EReport = { build, check: checkReport };
})();
