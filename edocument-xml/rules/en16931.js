/*
 * EN 16931 business rules for UBL invoices and credit notes.
 *
 * Follows the CEN EN 16931 UBL validation artefacts: core rules (BR-), conditions (BR-CO-), decimals (BR-DEC-),
 * the rules per VAT category (BR-S-, BR-Z-, BR-E-, BR-AE-, BR-IC-, BR-G-, BR-O-, BR-IG-, BR-IP-, BR-B-) and the
 * code lists that can be checked without the full UN/ECE tables (BR-CL-).
 * From the UBL schema it also checks date and number formats (XSD-DATE, XSD-DEC), which EN 16931 leaves to the XSD.
 * Not covered: PEPPOL BIS / national CIUS rules, UBL-CR/UBL-SR structure rules, the rest of XSD validation,
 * unit codes (Rec 20) and identifier scheme lists (ICD/EAS).
 *
 * Usage: EN16931.check(rootElement, "Invoice" | "CreditNote") → [{ id, ok, warn, text, detail, at }]
 * `at` lists the elements the rule is about (the failing ones when it fails).
 * Only rules whose condition the document triggers are returned.
 */
(function () {
  "use strict";

  // ---------- XML helpers (namespace-agnostic, direct children only) ----------
  const txt = (el) => (el ? el.textContent.trim() : "");
  function byPath(ctx, path) {
    if (!ctx) return [];
    let cur = [ctx];
    for (const seg of path.split("/")) {
      const next = [];
      for (const c of cur) for (const k of c.children) if (k.localName === seg) next.push(k);
      cur = next;
      if (!cur.length) break;
    }
    return cur;
  }
  const first = (ctx, path) => byPath(ctx, path)[0] || null;
  const val = (ctx, path) => txt(first(ctx, path));
  const has = (ctx, path) => !!val(ctx, path);
  function num(raw) { const s = String(raw).trim(); const n = Number(s); return s !== "" && isFinite(n) ? n : null; }
  const round = (x) => Math.round(x * 100) / 100;
  const fmt = (x) => round(x).toLocaleString(window.I18N ? I18N.locale() : undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- Code lists ----------
  const VAT_CAT = {
    S: "Standard rate", Z: "Zero rated", E: "Exempt from tax", AE: "VAT reverse charge",
    K: "Intra-community supply", G: "Export outside the EU", O: "Not subject to VAT",
    L: "Canary Islands (IGIC)", M: "Ceuta and Melilla (IPSI)", B: "Split payment (Italy)"
  };
  // UNTDID 1001 subset allowed by EN 16931.
  const DOC_TYPE_CODES = new Set(("71 80 81 82 83 84 102 130 202 203 204 211 218 219 261 262 295 296 308 325 326 331 380 381 " +
    "382 383 384 385 386 387 388 389 390 393 394 395 396 420 456 457 458 527 532 553 575 623 633 751 780 817 870 875 876 877 935").split(" "));
  // UNTDID 5189 (allowance reasons).
  const ALLOWANCE_CODES = new Set("41 42 60 62 63 64 65 66 67 68 70 71 88 95 100 102 103 104 105".split(" "));
  // CEF VATEX (VAT exemption reasons).
  const VATEX = new Set(["79-C", "132", "143", "148", "151", "309", "AE", "D", "F", "G", "I", "IC", "O", "J"].map((c) => "VATEX-EU-" + c)
    .concat("1A 1B 1C 1D 1E 1F 1FA 1G 1H 1I 1J 1K 1L 1M 1N 1O 1P 1Q".split(" ").map((c) => "VATEX-EU-132-" + c))
    .concat("1A 1B 1C 1D 1E 1F 1FA 1G 1H 1I 1J 1K 1L".split(" ").map((c) => "VATEX-EU-143-" + c))
    .concat("A B C D E F G H I".split(" ").map((c) => "VATEX-EU-148-" + c))
    .concat("1A 1AA 1B 1C 1D 1E".split(" ").map((c) => "VATEX-EU-151-" + c))
    .concat(["VATEX-FR-FRANCHISE", "VATEX-FR-CNWVAT"]));
  const MIME_CODES = new Set(["application/pdf", "image/png", "image/jpeg", "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet"]);

  let regionNames = null, currencyNames = null, currencySet = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  try { currencyNames = new Intl.DisplayNames(["en"], { type: "currency" }); } catch (e) {}
  try { currencySet = new Set(Intl.supportedValuesOf("currency")); } catch (e) {}
  // Without Intl support only the format is checked.
  const validCurrency = (c) => /^[A-Z]{3}$/.test(c) && (!currencyNames || (currencySet && currencySet.has(c)) || currencyNames.of(c) !== c);
  // xs:date: YYYY-MM-DD that exists on the calendar, optionally followed by a time zone.
  function validDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  const validCountry =(c) => c === "XI" || c === "1A" || (/^[A-Z]{2}$/.test(c) && c !== "ZZ" && (!regionNames || regionNames.of(c) !== c));

  // ---------- VAT category rules ----------
  // Each category has the same rule set (-01 … -10); these settings are what differs between them.
  //   party:  which VAT identifiers must (or must not) be present
  //   rate:   the rate allowed on lines, allowances and charges
  //   reason: whether the breakdown needs (true) or must not have (false) an exemption reason
  //   single: exactly one breakdown in the category (taxable amount checked in total, not per rate)
  //   calc:   VAT is taxable × rate (otherwise it must be 0)
  const VAT_RULES = [
    { cat: "S", prefix: "S", party: "seller", rate: "pos", reason: false, single: false, calc: true },
    { cat: "Z", prefix: "Z", party: "seller", rate: "zero", reason: false, single: true, calc: false },
    { cat: "E", prefix: "E", party: "seller", rate: "zero", reason: true, single: true, calc: false },
    { cat: "AE", prefix: "AE", party: "reverse", rate: "zero", reason: true, single: true, calc: false },
    { cat: "K", prefix: "IC", party: "intra", rate: "zero", reason: true, single: true, calc: false },
    { cat: "G", prefix: "G", party: "export", rate: "zero", reason: true, single: true, calc: false },
    { cat: "O", prefix: "O", party: "none", rate: "absent", reason: true, single: true, calc: false },
    { cat: "L", prefix: "IG", party: "seller", rate: "nonneg", reason: false, single: false, calc: true },
    { cat: "M", prefix: "IP", party: "seller", rate: "nonneg", reason: false, single: false, calc: true }
  ];
  const PARTY_TEXT = {
    seller: "the seller VAT ID (BT-31), tax registration (BT-32) or tax representative VAT ID (BT-63) must be present",
    reverse: "seller VAT ID (BT-31), tax registration (BT-32) or representative VAT ID (BT-63), and buyer VAT ID (BT-48) or legal registration (BT-47), must be present",
    intra: "seller VAT ID (BT-31) or representative VAT ID (BT-63), and buyer VAT ID (BT-48), must be present",
    export: "the seller VAT ID (BT-31) or tax representative VAT ID (BT-63) must be present",
    none: "no seller, tax representative or buyer VAT ID (BT-31, BT-63, BT-48) may be present"
  };
  const RATE_TEXT = { pos: "the VAT rate must be greater than 0", zero: "the VAT rate must be 0", absent: "no VAT rate may be given", nonneg: "the VAT rate must be 0 or greater" };
  const RATE_OK = {
    pos: (o) => o.rate !== null && o.rate > 0,
    zero: (o) => o.rate === 0,
    absent: (o) => !o.rateRaw,
    nonneg: (o) => o.rate !== null && o.rate >= 0
  };

  // EN 16931 applies the rounding amount (BT-114) only to the amount due (BR-CO-16).
  // Older UBL 2.1 samples fold it into the total incl. VAT instead; detect that so the checks follow the file.
  function roundingInInclusive(R) {
    const lmt = first(R, "LegalMonetaryTotal");
    if (!lmt) return false;
    const g = (p) => num(val(lmt, p));
    const docCur = val(R, "DocumentCurrencyCode");
    const vatEl = byPath(R, "TaxTotal/TaxAmount").find((e) => !docCur || e.getAttribute("currencyID") === docCur);
    const vat = vatEl ? num(txt(vatEl)) : null, b109 = g("TaxExclusiveAmount"), b112 = g("TaxInclusiveAmount"), b114 = g("PayableRoundingAmount");
    if (!b114 || vat === null || b109 === null || b112 === null) return false;
    const same = (a, b) => Math.abs(Math.round(a * 100) - Math.round(b * 100)) < 1;
    return !same(b109 + vat, b112) && same(b109 + vat + b114, b112);
  }

  // Extra rule sets (PEPPOL, national CIUS) register here from their own files; see register().
  const SETS = {};
  function register(id, set) { SETS[id] = set; }
  // Rule sets whose detect() says they apply to this document (e.g. by CustomizationID).
  const detect = (R) => Object.keys(SETS).filter((id) => SETS[id].detect && SETS[id].detect(R));

  // Runs EN 16931 plus the given extra rule sets (ids passed to register()).
  function check(R, kind, extraSets) {
    const cn = kind === "CreditNote";
    const out = [];
    let setLabel = "EN 16931";

    // ---------- Reporting helpers ----------
    // `at` is the element (or elements) the rule is about, so the page can point at the block or line.
    const rule = (id, at, ok, text, detail, warn) =>
      out.push({ id, set: setLabel, ok: !!ok, text, detail: detail || "", at: [].concat(at || R).filter(Boolean), warn: !!warn });
    // Amount comparison; tol is the allowed difference (the schematron allows ±1 on VAT calculations).
    // calc is the calculation written out with its numbers ("BT-106 100.00 − BT-107 5.00"), shown before the result.
    const cmp = (id, at, exp, actual, text, bt, tol, calc) => {
      const ok = actual !== null && Math.abs(round(exp) - round(actual)) < (tol || 0.005);
      const off = ok || actual === null ? "" : " (off by " + fmt(Math.abs(round(exp) - round(actual))) + ")";
      rule(id, at, ok, text, (calc ? calc + " = " : "") + fmt(exp) + (ok ? " = " : " ≠ ") + bt + " " + (actual === null ? "missing" : fmt(actual)) + off);
    };
    // Number for a calculation; "?" when missing.
    const n = (x) => (x === null || x === undefined ? "?" : fmt(x));
    // "line 1 100.00 + line 2 50.00 …" for the items being added up; long lists end with the rest summed.
    const terms = (list, key) => {
      if (!list.length) return "0.00";
      const shown = list.slice(0, 8).map((o) => o.name + " " + n(o[key]));
      const rest = list.slice(8);
      return shown.join(" + ") + (rest.length ? " + " + rest.length + " more " + n(rest.reduce((s, o) => s + (o[key] || 0), 0)) : "");
    };
    const names = (list) => list.slice(0, 6).join(", ") + (list.length > 6 ? " and " + (list.length - 6) + " more" : "");
    // Every item must pass the test; the failing ones are named in the detail.
    const each = (id, items, test, text, warn) => {
      if (!items.length) return;
      const bad = items.filter((o) => !test(o.el, o));
      rule(id, bad.length ? bad.map((o) => o.el) : items.map((o) => o.el), !bad.length, text, bad.length ? "Fails on " + names(bad.map((o) => o.name)) : "", warn);
    };
    const req = (id, ctx, path, text) => rule(id, ctx, has(ctx, path), text);

    // ---------- Document model ----------
    // Items are { el, name } plus, for anything that carries VAT, { cat, rate, rateRaw, amt }.
    const items = (els, name) => els.map((el, i) => ({ el, name: name(el, i) }));
    const taxed = (o, taxPath, amtPath) => Object.assign(o, {
      cat: val(o.el, taxPath + "/ID"), rateRaw: val(o.el, taxPath + "/Percent"),
      rate: num(val(o.el, taxPath + "/Percent")), amt: num(val(o.el, amtPath))
    });
    const sum = (list, key) => list.reduce((s, o) => s + (o[key] || 0), 0);
    const nonNeg = (raw) => { const n = num(raw); return n !== null && n >= 0; };

    const qtyTag = cn ? "CreditedQuantity" : "InvoicedQuantity";
    const lines = items(byPath(R, cn ? "CreditNoteLine" : "InvoiceLine"), (el, i) => "line " + (val(el, "ID") || i + 1))
      .map((o) => taxed(o, "Item/ClassifiedTaxCategory", "LineExtensionAmount"));
    const isCharge = (ac) => /^(true|1)$/.test(val(ac, "ChargeIndicator"));
    const allowCharges = (ctx, charge, prefix) =>
      items(byPath(ctx, "AllowanceCharge").filter((ac) => isCharge(ac) === charge),
        (el, i) => (prefix || "") + (charge ? "charge " : "allowance ") + (val(el, "AllowanceChargeReason") || val(el, "AllowanceChargeReasonCode") || i + 1))
        .map((o) => taxed(o, "TaxCategory", "Amount"));
    const allows = allowCharges(R, false), charges = allowCharges(R, true);
    const lineAllows = [].concat(...lines.map((l) => allowCharges(l.el, false, l.name + " ")));
    const lineCharges = [].concat(...lines.map((l) => allowCharges(l.el, true, l.name + " ")));

    const seller = first(R, "AccountingSupplierParty/Party"), buyer = first(R, "AccountingCustomerParty/Party");
    const payee = first(R, "PayeeParty"), rep = first(R, "TaxRepresentativeParty");
    const taxIds = (party, vat) => byPath(party, "PartyTaxScheme")
      .filter((s) => (val(s, "TaxScheme/ID") === "VAT") === vat).map((s) => val(s, "CompanyID")).filter(Boolean);

    const docCur = val(R, "DocumentCurrencyCode"), taxCur = val(R, "TaxCurrencyCode");
    const taxTotals = byPath(R, "TaxTotal");
    const vatTotal = taxTotals.find((t) => first(t, "TaxSubtotal")) ||
      taxTotals.find((t) => { const a = first(t, "TaxAmount"); return a && (!docCur || a.getAttribute("currencyID") === docCur); }) || null;
    const vatEl = first(vatTotal, "TaxAmount"), vat = vatEl ? num(txt(vatEl)) : null;
    const subs = items(byPath(vatTotal, "TaxSubtotal"),
      (el) => "VAT breakdown " + [val(el, "TaxCategory/ID"), val(el, "TaxCategory/Percent") ? val(el, "TaxCategory/Percent") + " %" : ""].filter(Boolean).join(" "))
      .map((o) => Object.assign(taxed(o, "TaxCategory", "TaxableAmount"), { tax: num(val(o.el, "TaxAmount")) }));
    const lmt = first(R, "LegalMonetaryTotal");

    // ---------- Mandatory content ----------
    req("BR-01", R, "CustomizationID", "Specification identifier (BT-24) must be present");
    req("BR-02", R, "ID", "Invoice number (BT-1) must be present");
    req("BR-03", R, "IssueDate", "Issue date (BT-2) must be present");
    req("BR-04", R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode", "Invoice type code (BT-3) must be present");
    req("BR-05", R, "DocumentCurrencyCode", "Invoice currency code (BT-5) must be present");
    req("BR-06", seller, "PartyLegalEntity/RegistrationName", "Seller name (BT-27) must be present");
    req("BR-07", buyer, "PartyLegalEntity/RegistrationName", "Buyer name (BT-44) must be present");
    rule("BR-08", seller, !!first(seller, "PostalAddress"), "Seller postal address (BG-5) must be present");
    req("BR-09", seller, "PostalAddress/Country/IdentificationCode", "Seller country code (BT-40) must be present");
    rule("BR-10", buyer, !!first(buyer, "PostalAddress"), "Buyer postal address (BG-8) must be present");
    req("BR-11", buyer, "PostalAddress/Country/IdentificationCode", "Buyer country code (BT-55) must be present");
    req("BR-12", lmt, "LineExtensionAmount", "Sum of line net amounts (BT-106) must be present");
    req("BR-13", lmt, "TaxExclusiveAmount", "Total without VAT (BT-109) must be present");
    req("BR-14", lmt, "TaxInclusiveAmount", "Total with VAT (BT-112) must be present");
    req("BR-15", lmt, "PayableAmount", "Amount due for payment (BT-115) must be present");
    rule("BR-16", R, lines.length > 0, "The document must have at least one line (BG-25)");
    if (payee) req("BR-17", payee, "PartyName/Name", "Payee name (BT-59) must be present");
    if (rep) {
      req("BR-18", rep, "PartyName/Name", "Tax representative name (BT-62) must be present");
      rule("BR-19", rep, !!first(rep, "PostalAddress"), "Tax representative postal address (BG-12) must be present");
      req("BR-20", rep, "PostalAddress/Country/IdentificationCode", "Tax representative country code (BT-69) must be present");
      rule("BR-56", rep, taxIds(rep, true).length > 0, "Tax representative VAT identifier (BT-63) must be present");
    }

    // ---------- Lines ----------
    each("BR-21", lines, (el) => has(el, "ID"), "Each line must have a line identifier (BT-126)");
    each("BR-22", lines, (el) => has(el, qtyTag), "Each line must have an invoiced quantity (BT-129)");
    each("BR-23", lines, (el) => { const q = first(el, qtyTag); return !!(q && q.getAttribute("unitCode")); }, "Each line must have a unit of measure (BT-130)");
    each("BR-24", lines, (el) => has(el, "LineExtensionAmount"), "Each line must have a net amount (BT-131)");
    each("BR-25", lines, (el) => has(el, "Item/Name"), "Each line must have an item name (BT-153)");
    each("BR-26", lines, (el) => has(el, "Price/PriceAmount"), "Each line must have an item net price (BT-146)");
    each("BR-27", lines.filter((o) => has(o.el, "Price/PriceAmount")), (el) => nonNeg(val(el, "Price/PriceAmount")),
      "Item net price (BT-146) must not be negative");
    each("BR-28", lines.filter((o) => has(o.el, "Price/AllowanceCharge/BaseAmount")), (el) => nonNeg(val(el, "Price/AllowanceCharge/BaseAmount")),
      "Item gross price (BT-148) must not be negative");
    each("BR-CO-04", lines, (el, o) => !!o.cat, "Each line must have a VAT category code (BT-151)");
    const fromLines = (path) => [].concat(...lines.map((l) => byPath(l.el, path)));
    each("BR-54", items(fromLines("Item/AdditionalItemProperty"), (el, i) => "item attribute " + (val(el, "Name") || i + 1)),
      (el) => has(el, "Name") && has(el, "Value"), "Each item attribute (BG-32) must have a name (BT-160) and a value (BT-161)");
    each("BR-64", items(fromLines("Item/StandardItemIdentification/ID"), txt),
      (el) => !!el.getAttribute("schemeID"), "Item standard identifiers (BT-157) must have a scheme (schemeID)");
    each("BR-65", items(fromLines("Item/CommodityClassification/ItemClassificationCode"), txt),
      (el) => !!el.getAttribute("listID"), "Item classification codes (BT-158) must have a scheme (listID)");

    // ---------- Periods ----------
    const period = first(R, "InvoicePeriod");
    if (period) {
      rule("BR-CO-19", period, has(period, "StartDate") || has(period, "EndDate") || has(period, "DescriptionCode"),
        "Invoicing period (BG-14) must have a start date, end date or description code");
      if (has(period, "StartDate") && has(period, "EndDate"))
        rule("BR-29", period, val(period, "EndDate") >= val(period, "StartDate"), "Invoicing period end date (BT-74) must not be before its start date (BT-73)",
          val(period, "StartDate") + " → " + val(period, "EndDate"));
    }
    const linePeriods = lines.filter((o) => first(o.el, "InvoicePeriod"));
    each("BR-CO-20", linePeriods, (el) => has(el, "InvoicePeriod/StartDate") || has(el, "InvoicePeriod/EndDate"),
      "Line periods (BG-26) must have a start or end date");
    each("BR-30", linePeriods.filter((o) => has(o.el, "InvoicePeriod/StartDate") && has(o.el, "InvoicePeriod/EndDate")),
      (el) => val(el, "InvoicePeriod/EndDate") >= val(el, "InvoicePeriod/StartDate"), "Line period end date (BT-135) must not be before its start date (BT-134)");
    if (has(R, "TaxPointDate") || has(R, "InvoicePeriod/DescriptionCode"))
      rule("BR-CO-03", R, !(has(R, "TaxPointDate") && has(R, "InvoicePeriod/DescriptionCode")),
        "VAT point date (BT-7) and VAT point date code (BT-8) must not both be used");

    // ---------- Allowances and charges ----------
    const hasReason = (el) => has(el, "AllowanceChargeReason") || has(el, "AllowanceChargeReasonCode");
    each("BR-31", allows, (el) => has(el, "Amount"), "Document allowances must have an amount (BT-92)");
    each("BR-32", allows, (el, o) => !!o.cat, "Document allowances must have a VAT category code (BT-95)");
    each("BR-CO-21", allows, hasReason, "Document allowances must have a reason (BT-97) or reason code (BT-98)");
    each("BR-36", charges, (el) => has(el, "Amount"), "Document charges must have an amount (BT-99)");
    each("BR-37", charges, (el, o) => !!o.cat, "Document charges must have a VAT category code (BT-102)");
    each("BR-CO-22", charges, hasReason, "Document charges must have a reason (BT-104) or reason code (BT-105)");
    each("BR-41", lineAllows, (el) => has(el, "Amount"), "Line allowances must have an amount (BT-136)");
    each("BR-CO-23", lineAllows, hasReason, "Line allowances must have a reason (BT-139) or reason code (BT-140)");
    each("BR-43", lineCharges, (el) => has(el, "Amount"), "Line charges must have an amount (BT-141)");
    each("BR-CO-24", lineCharges, hasReason, "Line charges must have a reason (BT-144) or reason code (BT-145)");

    // ---------- VAT breakdown ----------
    rule("BR-CO-18", vatTotal, subs.length > 0, "The document must have at least one VAT breakdown (BG-23)");
    each("BR-45", subs, (el) => has(el, "TaxableAmount"), "Each VAT breakdown must have a taxable amount (BT-116)");
    each("BR-46", subs, (el) => has(el, "TaxAmount"), "Each VAT breakdown must have a VAT amount (BT-117)");
    each("BR-47", subs, (el, o) => !!o.cat, "Each VAT breakdown must have a VAT category code (BT-118)");
    each("BR-48", subs, (el, o) => o.cat === "O" || !!o.rateRaw, "Each VAT breakdown, except “not subject to VAT”, must have a VAT rate (BT-119)");
    subs.forEach((s) => {
      if (s.amt === null || s.tax === null) return;
      if (s.rate === null || round(s.rate) === 0) cmp("BR-CO-17", s.el, 0, s.tax, s.name + ": VAT amount must be 0 at a 0 % rate", "BT-117");
      else cmp("BR-CO-17", s.el, round(s.amt * s.rate / 100), s.tax, s.name + ": VAT amount must equal taxable amount × rate", "BT-117", 1,
        "BT-116 " + n(s.amt) + " × " + s.rateRaw + " %");
    });
    if (taxCur) rule("BR-53", vatTotal, taxTotals.some((t) => { const a = first(t, "TaxAmount"); return a && a.getAttribute("currencyID") === taxCur; }),
      "VAT total in accounting currency (BT-111) must be present, because an accounting currency (BT-6) is given");

    // ---------- Totals ----------
    if (lmt) {
      const g = (p) => num(val(lmt, p));
      const b106 = g("LineExtensionAmount"), b107 = g("AllowanceTotalAmount") || 0, b108 = g("ChargeTotalAmount") || 0;
      const b109 = g("TaxExclusiveAmount"), b112 = g("TaxInclusiveAmount"), b113 = g("PrepaidAmount") || 0;
      const b114 = g("PayableRoundingAmount") || 0, b115 = g("PayableAmount");
      const inIncl = roundingInInclusive(R);
      if (lines.length) cmp("BR-CO-10", lmt, sum(lines, "amt"), b106, "Sum of line net amounts (BT-106) must equal the line net amounts added up", "BT-106", 0, terms(lines, "amt"));
      if (allows.length || has(lmt, "AllowanceTotalAmount")) cmp("BR-CO-11", lmt, sum(allows, "amt"), g("AllowanceTotalAmount"), "Sum of allowances (BT-107) must equal the document allowances added up", "BT-107", 0, terms(allows, "amt"));
      if (charges.length || has(lmt, "ChargeTotalAmount")) cmp("BR-CO-12", lmt, sum(charges, "amt"), g("ChargeTotalAmount"), "Sum of charges (BT-108) must equal the document charges added up", "BT-108", 0, terms(charges, "amt"));
      if (b106 !== null && b109 !== null) cmp("BR-CO-13", lmt, b106 - b107 + b108, b109, "Total without VAT (BT-109) must equal lines − allowances + charges", "BT-109", 0,
        "BT-106 " + n(b106) + " − BT-107 " + n(b107) + " + BT-108 " + n(b108));
      const vatCalc = "BT-109 " + n(b109) + " + BT-110 " + n(vat || 0);
      if (b109 !== null && b112 !== null) {
        if (inIncl) cmp("BR-CO-15", lmt, b109 + (vat || 0) + b114, b112, "Total with VAT (BT-112) must equal total without VAT + VAT + rounding (rounding included, as in older UBL samples)", "BT-112", 0,
          vatCalc + " + BT-114 " + n(b114));
        else cmp("BR-CO-15", lmt, b109 + (vat || 0), b112, "Total with VAT (BT-112) must equal total without VAT + VAT", "BT-112", 0, vatCalc);
      }
      if (b112 !== null && b115 !== null) {
        const dueCalc = "BT-112 " + n(b112) + " − BT-113 " + n(b113);
        if (inIncl) cmp("BR-CO-16", lmt, b112 - b113, b115, "Amount due (BT-115) must equal total with VAT − paid (rounding already included)", "BT-115", 0, dueCalc);
        else cmp("BR-CO-16", lmt, b112 - b113 + b114, b115, b114 ? "Amount due (BT-115) must equal total with VAT − paid + rounding" : "Amount due (BT-115) must equal total with VAT − paid", "BT-115", 0,
          dueCalc + (b114 ? " + BT-114 " + n(b114) : ""));
      }
      if (b115 !== null && b115 > 0)
        rule("BR-CO-25", R, has(R, "DueDate") || has(R, "PaymentMeans/PaymentDueDate") || has(R, "PaymentTerms/Note"),
          "A positive amount due must have a due date (BT-9) or payment terms (BT-20)");
    }
    if (vat !== null && subs.length) cmp("BR-CO-14", vatTotal, sum(subs, "tax"), vat, "VAT total (BT-110) must equal the VAT breakdown amounts added up", "BT-110", 0, terms(subs, "tax"));

    // ---------- Decimals: amounts carry at most two ----------
    const decimals = (id, els, label) => {
      els = els.filter(Boolean);
      if (!els.length) return;
      const bad = els.filter((e) => (txt(e).split(".")[1] || "").length > 2);
      rule(id, bad.length ? bad : els, !bad.length, label + " must have at most 2 decimals", bad.length ? "Found " + names(bad.map(txt)) : "");
    };
    const at = (list, path) => list.map((o) => first(o.el, path));
    decimals("BR-DEC-01", at(allows, "Amount"), "Document allowance amount (BT-92)");
    decimals("BR-DEC-02", at(allows, "BaseAmount"), "Document allowance base amount (BT-93)");
    decimals("BR-DEC-05", at(charges, "Amount"), "Document charge amount (BT-99)");
    decimals("BR-DEC-06", at(charges, "BaseAmount"), "Document charge base amount (BT-100)");
    [["09", "LineExtensionAmount", "Sum of line net amounts (BT-106)"], ["10", "AllowanceTotalAmount", "Sum of allowances (BT-107)"],
      ["11", "ChargeTotalAmount", "Sum of charges (BT-108)"], ["12", "TaxExclusiveAmount", "Total without VAT (BT-109)"],
      ["14", "TaxInclusiveAmount", "Total with VAT (BT-112)"], ["16", "PrepaidAmount", "Paid amount (BT-113)"],
      ["17", "PayableRoundingAmount", "Rounding amount (BT-114)"], ["18", "PayableAmount", "Amount due (BT-115)"]]
      .forEach(([n, path, label]) => decimals("BR-DEC-" + n, [first(lmt, path)], label));
    decimals("BR-DEC-13", [vatEl], "VAT total (BT-110)");
    if (taxCur) decimals("BR-DEC-15", taxTotals.map((t) => first(t, "TaxAmount")).filter((a) => a && a.getAttribute("currencyID") === taxCur),
      "VAT total in accounting currency (BT-111)");
    decimals("BR-DEC-19", at(subs, "TaxableAmount"), "VAT category taxable amount (BT-116)");
    decimals("BR-DEC-20", at(subs, "TaxAmount"), "VAT category tax amount (BT-117)");
    decimals("BR-DEC-23", at(lines, "LineExtensionAmount"), "Line net amount (BT-131)");
    decimals("BR-DEC-24", at(lineAllows, "Amount"), "Line allowance amount (BT-136)");
    decimals("BR-DEC-25", at(lineAllows, "BaseAmount"), "Line allowance base amount (BT-137)");
    decimals("BR-DEC-27", at(lineCharges, "Amount"), "Line charge amount (BT-141)");
    decimals("BR-DEC-28", at(lineCharges, "BaseAmount"), "Line charge base amount (BT-142)");

    // ---------- VAT categories ----------
    // A line charge or allowance has no VAT category of its own: it is taxed with its line (BT-151/BT-152).
    const sellerVat = taxIds(seller, true).length > 0, sellerReg = taxIds(seller, false).length > 0, repVat = taxIds(rep, true).length > 0;
    const buyerVat = taxIds(buyer, true).length > 0, buyerLegal = has(buyer, "PartyLegalEntity/CompanyID");
    const partyOk = {
      seller: sellerVat || sellerReg || repVat,
      reverse: (sellerVat || sellerReg || repVat) && (buyerVat || buyerLegal),
      intra: (sellerVat || repVat) && buyerVat,
      export: sellerVat || repVat,
      none: !sellerVat && !repVat && !buyerVat
    };
    const hasExemption = (el) => has(el, "TaxCategory/TaxExemptionReason") || has(el, "TaxCategory/TaxExemptionReasonCode");

    VAT_RULES.forEach((v) => {
      const id = (n) => "BR-" + v.prefix + "-" + n, nm = VAT_CAT[v.cat] + " (" + v.cat + ")";
      const inCat = (o) => o.cat === v.cat;
      const L = lines.filter(inCat), A = allows.filter(inCat), C = charges.filter(inCat), B = subs.filter(inCat);

      if (L.length || A.length || C.length) {
        rule(id("01"), B.length ? B.map((b) => b.el) : vatTotal, v.single ? B.length === 1 : B.length > 0,
          nm + " is used, so it must have " + (v.single ? "exactly one" : "a") + " VAT breakdown", B.length + " found");
        [["02", L, "lines"], ["03", A, "document allowances"], ["04", C, "document charges"]].forEach(([n, list, what]) => {
          if (list.length) rule(id(n), seller, partyOk[v.party], "With " + what + " in " + nm + ", " + PARTY_TEXT[v.party]);
        });
      }

      const rateOk = (el, o) => RATE_OK[v.rate](o);
      each(id("05"), L, rateOk, "Lines in " + nm + ": " + RATE_TEXT[v.rate]);
      each(id("06"), A, rateOk, "Document allowances in " + nm + ": " + RATE_TEXT[v.rate]);
      each(id("07"), C, rateOk, "Document charges in " + nm + ": " + RATE_TEXT[v.rate]);

      // Taxable amount = lines + charges − allowances in the category (per rate where several rates are allowed).
      const basis = (match) => sum(L.filter(match), "amt") + sum(C.filter(match), "amt") - sum(A.filter(match), "amt");
      // Written out: "lines (line 1 100.00 + line 2 50.00) + charges (…) − allowances (…)", leaving out empty groups.
      const basisCalc = (match) => {
        const group = (list, label) => { list = list.filter(match); return list.length ? label + " (" + terms(list, "amt") + ")" : ""; };
        const plus = [group(L, "lines"), group(C, "charges")].filter(Boolean).join(" + ") || "0.00", minus = group(A, "allowances");
        return plus + (minus ? " − " + minus : "");
      };
      if (v.single) {
        if (B.length) cmp(id("08"), B.map((b) => b.el), basis(() => true), sum(B, "amt"), "Taxable amount in " + nm + " must equal its lines + charges − allowances", "BT-116", 0,
          basisCalc(() => true));
      } else {
        B.forEach((b) => {
          const match = (o) => o.rate !== null && b.rate !== null && round(o.rate) === round(b.rate);
          const text = "Taxable amount in " + nm + " at " + (b.rateRaw || "?") + " % must equal lines + charges − allowances at that rate";
          if (L.concat(A, C).some(match)) cmp(id("08"), b.el, basis(match), b.amt, text, "BT-116", 1, basisCalc(match));
          else rule(id("08"), b.el, false, text, "No line, allowance or charge is in " + v.cat + " at " + (b.rateRaw || "?") +
            " %, yet the breakdown taxes " + (b.amt === null ? "?" : fmt(b.amt)));
        });
      }

      B.forEach((b) => {
        if (b.tax === null) return;
        if (!v.calc) cmp(id("09"), b.el, 0, b.tax, "VAT amount in " + nm + " must be 0", "BT-117");
        else if (b.amt !== null && b.rate !== null)
          cmp(id("09"), b.el, round(b.amt * b.rate / 100), b.tax, "VAT amount in " + nm + " at " + b.rateRaw + " % must equal taxable amount × rate", "BT-117", 1,
            "BT-116 " + n(b.amt) + " × " + b.rateRaw + " %");
      });
      each(id("10"), B, (el) => (v.reason ? hasExemption(el) : !hasExemption(el)),
        "VAT breakdown in " + nm + (v.reason ? " must have an exemption reason (BT-120) or code (BT-121)" : " must not have an exemption reason (BT-120/BT-121)"));

      if (v.cat === "K" && B.length) {
        rule("BR-IC-11", first(R, "Delivery"), has(R, "Delivery/ActualDeliveryDate") || !!first(R, "InvoicePeriod"),
          "Intra-community supply must give an actual delivery date (BT-72) or an invoicing period (BG-14)");
        rule("BR-IC-12", first(R, "Delivery"), has(R, "Delivery/DeliveryLocation/Address/Country/IdentificationCode"),
          "Intra-community supply must give the deliver-to country code (BT-80)");
      }
      if (v.cat === "O" && B.length) {
        rule("BR-O-11", vatTotal, subs.length === B.length, "With “not subject to VAT” there must be no VAT breakdown in another category");
        each("BR-O-12", lines, (el, o) => o.cat === "O", "With “not subject to VAT” every line must be in category O");
        each("BR-O-13", allows, (el, o) => o.cat === "O", "With “not subject to VAT” every document allowance must be in category O");
        each("BR-O-14", charges, (el, o) => o.cat === "O", "With “not subject to VAT” every document charge must be in category O");
      }
    });
    const taxedItems = lines.concat(allows, charges);
    if (taxedItems.some((o) => o.cat === "B")) {
      rule("BR-B-01", seller, val(seller, "PostalAddress/Country/IdentificationCode") === "IT", "Split payment (B) may only be used on a domestic Italian invoice");
      rule("BR-B-02", vatTotal, !taxedItems.some((o) => o.cat === "S"), "Split payment (B) must not be combined with standard rated (S) lines, allowances or charges");
    }

    // ---------- Parties and payment ----------
    const vatIds = [[seller, "seller"], [buyer, "buyer"], [rep, "tax representative"]]
      .flatMap(([party, who]) => taxIds(party, true).map((id) => ({ el: party, name: who + " " + id, id })));
    each("BR-CO-09", vatIds, (el, o) => o.id.slice(0, 2) === "EL" || validCountry(o.id.slice(0, 2)),
      "VAT identifiers (BT-31, BT-48, BT-63) must start with a country prefix");
    rule("BR-CO-26", seller, has(seller, "PartyIdentification/ID") || has(seller, "PartyLegalEntity/CompanyID") || sellerVat,
      "The seller must have an identifier (BT-29), legal registration (BT-30) or VAT ID (BT-31)");
    const endpoint = (id, party, text) => { const e = first(party, "EndpointID"); if (e) rule(id, e, !!e.getAttribute("schemeID"), text); };
    endpoint("BR-62", seller, "Seller electronic address (BT-34) must have a scheme (schemeID)");
    endpoint("BR-63", buyer, "Buyer electronic address (BT-49) must have a scheme (schemeID)");

    const payMeans = items(byPath(R, "PaymentMeans"), (el, i) => "payment means " + (val(el, "PaymentMeansCode") || i + 1));
    each("BR-49", payMeans, (el) => has(el, "PaymentMeansCode"), "Each payment instruction must have a payment means code (BT-81)");
    each("BR-50", payMeans.filter((o) => first(o.el, "PayeeFinancialAccount")), (el) => has(el, "PayeeFinancialAccount/ID"),
      "Credit transfer details (BG-17) must include the account ID (BT-84)");
    each("BR-61", payMeans.filter((o) => ["30", "58"].includes(val(o.el, "PaymentMeansCode"))), (el) => has(el, "PayeeFinancialAccount/ID"),
      "Credit transfers (code 30 or 58) must give the payment account ID (BT-84)");
    const cards = byPath(R, "PaymentMeans/CardAccount"), mandates = byPath(R, "PaymentMeans/PaymentMandate");
    if (cards.length) rule("BR-66", cards, cards.length === 1, "Only one payment card (BG-18) is allowed", cards.length + " found");
    if (mandates.length) rule("BR-67", mandates, mandates.length === 1, "Only one direct debit mandate (BG-19) is allowed", mandates.length + " found");
    each("BR-51", items(cards, (el) => "card " + val(el, "PrimaryAccountNumberID")),
      (el) => (val(el, "PrimaryAccountNumberID").match(/\d/g) || []).length <= 10,
      "Card number (BT-87) should show no more than the first 6 and last 4 digits", true);

    // ---------- References ----------
    each("BR-52", items(byPath(R, "AdditionalDocumentReference"), (el, i) => "supporting document " + (i + 1)), (el) => has(el, "ID"),
      "Each supporting document (BG-24) must have a reference (BT-122)");
    each("BR-55", items(byPath(R, "BillingReference/InvoiceDocumentReference"), (el, i) => "preceding invoice " + (i + 1)), (el) => has(el, "ID"),
      "Each preceding invoice reference (BG-3) must have an invoice number (BT-25)");
    each("BR-57", items(byPath(R, "Delivery/DeliveryLocation/Address"), (el, i) => "deliver-to address " + (i + 1)), (el) => has(el, "Country/IdentificationCode"),
      "Each deliver-to address (BG-15) must have a country code (BT-80)");

    // ---------- Data types (UBL schema) ----------
    // EN 16931 leaves these to XSD validation, so its schematron never reports them.
    const allEls = Array.from(R.getElementsByTagName("*"));
    const named = (el) => el.localName + " “" + txt(el) + "”";
    each("XSD-DATE", items(allEls.filter((e) => /Date$/.test(e.localName) && !e.children.length), named), (el) => validDate(txt(el)),
      "Dates must be real calendar dates written as YYYY-MM-DD");
    each("XSD-DEC", items(allEls.filter((e) => !e.children.length &&
      (e.hasAttribute("currencyID") || /(Quantity|Percent|MultiplierFactorNumeric)$/.test(e.localName))), named),
      (el) => /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(txt(el)), "Amounts, quantities and percentages must be plain decimal numbers");

    // ---------- Code lists ----------
    const typeCode = val(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode");
    if (typeCode) rule("BR-CL-01", first(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode"), DOC_TYPE_CODES.has(typeCode), "Invoice type code (BT-3) must be in the EN 16931 subset of UNTDID 1001", typeCode);
    each("BR-CL-03", items(allEls.filter((e) => e.hasAttribute("currencyID")), (el) => el.localName + " " + el.getAttribute("currencyID")),
      (el) => validCurrency(el.getAttribute("currencyID")), "Amount currencies (currencyID) must be ISO 4217 codes");
    if (docCur) rule("BR-CL-04", first(R, "DocumentCurrencyCode"), validCurrency(docCur), "Invoice currency code (BT-5) must be an ISO 4217 code", docCur);
    if (taxCur) rule("BR-CL-05", first(R, "TaxCurrencyCode"), validCurrency(taxCur), "VAT accounting currency code (BT-6) must be an ISO 4217 code", taxCur);
    each("BR-CL-14", items(allEls.filter((e) => e.localName === "IdentificationCode" && e.parentElement && e.parentElement.localName === "Country"),
      (el) => txt(el) || "(empty)"), (el) => validCountry(txt(el)), "Country codes must be ISO 3166-1 alpha-2 codes");
    each("BR-CL-16", items(byPath(R, "PaymentMeans/PaymentMeansCode"), txt),
      (el) => txt(el) === "ZZZ" || (/^[1-9]\d?$/.test(txt(el)) && +txt(el) <= 97), "Payment means codes (BT-81) must be UNTDID 4461 codes");
    each("BR-CL-17", lines.filter((o) => o.cat), (el, o) => !!VAT_CAT[o.cat], "Line VAT category codes (BT-151) must be UNTDID 5305 codes");
    each("BR-CL-18", subs.concat(allows, charges).filter((o) => o.cat), (el, o) => !!VAT_CAT[o.cat],
      "VAT category codes (BT-95, BT-102, BT-118) must be UNTDID 5305 codes");
    each("BR-CL-19", allows.concat(lineAllows).filter((o) => has(o.el, "AllowanceChargeReasonCode")),
      (el) => ALLOWANCE_CODES.has(val(el, "AllowanceChargeReasonCode")), "Allowance reason codes (BT-98, BT-140) must be UNTDID 5189 codes");
    each("BR-CL-20", charges.concat(lineCharges).filter((o) => has(o.el, "AllowanceChargeReasonCode")),
      (el) => /^[A-Z]{2,3}$/.test(val(el, "AllowanceChargeReasonCode")), "Charge reason codes (BT-105, BT-145) must be UNTDID 7161 codes");
    each("BR-CL-22", subs.filter((o) => has(o.el, "TaxCategory/TaxExemptionReasonCode")),
      (el) => VATEX.has(val(el, "TaxCategory/TaxExemptionReasonCode").toUpperCase()), "VAT exemption reason codes (BT-121) must be on the CEF VATEX list");
    each("BR-CL-24", items(byPath(R, "AdditionalDocumentReference/Attachment/EmbeddedDocumentBinaryObject"),
      (el) => el.getAttribute("filename") || el.getAttribute("mimeCode") || "attachment"),
      (el) => MIME_CODES.has(el.getAttribute("mimeCode")), "Attachments must use an allowed MIME code (PDF, PNG, JPEG, CSV, XLSX or ODS)");

    // ---------- Consistency (this tool's own CHK- checks) ----------
    // Things EN 16931 does not test but that are wrong in practice. Errors where the data cannot be right,
    // warnings where there are legitimate exceptions.
    setLabel = "Consistency";
    const peppol = (extraSets || []).includes("peppol");
    const issue = val(R, "IssueDate"), dateOk = (s) => !!s && validDate(s);
    const dateEl = (path) => first(R, path);

    // Dates
    if (dateOk(issue)) {
      [["DueDate", "Due date (BT-9)"], ["PaymentMeans/PaymentDueDate", "Payment due date"]].forEach(([path, label]) => {
        const d = val(R, path);
        if (dateOk(d)) rule("CHK-01", dateEl(path), d >= issue, label + " must not be before the issue date (BT-2)",
          d >= issue ? "due date " + d + ", issue date " + issue : "due date " + d + " is before the issue date " + issue);
      });
      const today = new Date().toISOString().slice(0, 10);
      rule("CHK-02", dateEl("IssueDate"), issue <= today, "Issue date (BT-2) should not be in the future", "issued " + issue + (issue <= today ? " ≤ " : " > ") + "today " + today, true);
      const prev = items(byPath(R, "BillingReference/InvoiceDocumentReference").filter((e) => dateOk(val(e, "IssueDate"))),
        (el) => "preceding invoice " + (val(el, "ID") || "?") + " issued " + val(el, "IssueDate"));
      each("CHK-03", prev, (el) => val(el, "IssueDate") <= issue, "Preceding invoices (BT-26) must not be dated after this document (" + issue + ")");
      const docStart = val(R, "InvoicePeriod/StartDate");
      if (dateOk(docStart) && docStart > issue)
        rule("CHK-04", first(R, "InvoicePeriod"), false, "Invoicing period (BG-14) should not start after the issue date", "period starts " + docStart + " > issued " + issue + " (fine for an advance invoice)", true);
    }
    if (!peppol) {
      // PEPPOL-EN16931-R110/R111 do this when PEPPOL is on.
      const ps = val(R, "InvoicePeriod/StartDate"), pe = val(R, "InvoicePeriod/EndDate");
      const inPeriod = lines.filter((o) => first(o.el, "InvoicePeriod"));
      if ((dateOk(ps) || dateOk(pe)) && inPeriod.length)
        each("CHK-05", inPeriod, (el) => {
          const s = val(el, "InvoicePeriod/StartDate"), e = val(el, "InvoicePeriod/EndDate");
          return (!dateOk(ps) || !s || s >= ps) && (!dateOk(pe) || !e || e <= pe);
        }, "Line periods (BG-26) should fall inside the invoicing period (" + (ps || "…") + " to " + (pe || "…") + ")", true);
    }

    // Document type
    if (!cn && typeCode && ["381", "261", "262", "296", "308", "532"].includes(typeCode))
      rule("CHK-06", first(R, "InvoiceTypeCode"), false, "A credit note type code (" + typeCode + ") should not be used in an Invoice document", "Credit notes normally use the CreditNote document", true);
    if (cn) rule("CHK-07", first(R, "BillingReference") || R, byPath(R, "BillingReference/InvoiceDocumentReference/ID").some((e) => txt(e) && !/^(NA|N\/A|-)$/i.test(txt(e))),
      "The credit note should refer to the invoice it corrects (BT-25)", val(R, "BillingReference/InvoiceDocumentReference/ID") ? "Given as “" + val(R, "BillingReference/InvoiceDocumentReference/ID") + "”" : "No preceding invoice", true);

    // Lines
    const lineIds = lines.map((o) => val(o.el, "ID")).filter(Boolean);
    const dupIds = lineIds.filter((v, i) => lineIds.indexOf(v) !== i);
    if (lines.length > 1) rule("CHK-08", dupIds.length ? lines.filter((o) => dupIds.includes(val(o.el, "ID"))).map((o) => o.el) : lines.map((o) => o.el),
      !dupIds.length, "Line identifiers (BT-126) must be unique", dupIds.length ? "Repeated: " + names(dupIds.filter((v, i) => dupIds.indexOf(v) === i)) : "");
    each("CHK-09", lines.filter((o) => num(val(o.el, qtyTag)) === 0), (el, o) => !o.amt, "Lines with quantity 0 should have no net amount", true);
    if (!peppol) lines.forEach((o) => {
      // Same calculation as PEPPOL-EN16931-R120, for documents checked without PEPPOL.
      const qty = num(val(o.el, qtyTag)), price = num(val(o.el, "Price/PriceAmount"));
      const baseQty = has(o.el, "Price/BaseQuantity") ? num(val(o.el, "Price/BaseQuantity")) : 1;
      if (qty === null || price === null || !baseQty || o.amt === null) return;
      const own = (charge) => byPath(o.el, "AllowanceCharge").filter((ac) => isCharge(ac) === charge).reduce((s, ac) => s + (num(val(ac, "Amount")) || 0), 0);
      const ch = own(true), al = own(false);
      cmp("CHK-10", o.el, round(qty * price / baseQty) + ch - al, o.amt, o.name + ": net amount must equal quantity × net price / base quantity + charges − allowances", "BT-131", 0.02,
        "qty " + val(o.el, qtyTag) + " × price " + fmt(price) + " / base qty " + baseQty + " + charges " + fmt(ch) + " − allowances " + fmt(al));
    });
    if (!peppol) allows.concat(charges, lineAllows, lineCharges).filter((o) => has(o.el, "BaseAmount") && has(o.el, "MultiplierFactorNumeric")).forEach((o) => {
      const base = num(val(o.el, "BaseAmount")), pct = num(val(o.el, "MultiplierFactorNumeric"));
      if (base !== null && pct !== null) cmp("CHK-11", o.el, base * pct / 100, num(val(o.el, "Amount")), o.name + ": amount must equal base amount × percentage", "amount", 0.02,
        "base " + fmt(base) + " × " + val(o.el, "MultiplierFactorNumeric") + " %");
    });

    // VAT breakdown
    const subKey = (o) => (o.cat || "?") + (o.rate === null ? "" : " " + round(o.rate) + " %");
    const subKeys = subs.map(subKey), dupSubs = subKeys.filter((k, i) => subKeys.indexOf(k) !== i);
    if (subs.length > 1) rule("CHK-12", subs.map((o) => o.el), !dupSubs.length, "Each VAT category and rate must have only one VAT breakdown", dupSubs.length ? "Repeated: " + names(dupSubs) : "");
    const usedKeys = taxedItems.filter((o) => o.cat).map(subKey).filter((k, i, a) => a.indexOf(k) === i);
    if (subs.length) {
      const missing = usedKeys.filter((k) => !subKeys.includes(k));
      rule("CHK-13", vatTotal, !missing.length, "Each VAT category and rate used on lines, allowances or charges must have a VAT breakdown",
        missing.length ? "No breakdown for " + names(missing) : "Used: " + names(usedKeys));
    }
    each("CHK-14", taxedItems.concat(subs).filter((o) => o.rate !== null), (el, o) => o.rate >= 0 && o.rate <= 30, "VAT rates should be between 0 and 30 %", true);

    // Currency
    if (docCur) {
      const amounts = allEls.filter((e) => e.hasAttribute("currencyID"));
      const taxCurEls = taxCur ? taxTotals.map((t) => first(t, "TaxAmount")).filter((a) => a && a.getAttribute("currencyID") === taxCur) : [];
      each("CHK-15", items(amounts.filter((e) => !taxCurEls.includes(e)), (el) => el.localName + " " + el.getAttribute("currencyID")),
        (el) => el.getAttribute("currencyID") === docCur, "All amounts must be in the document currency (" + docCur + ")");
    }

    // Totals
    if (lmt) {
      const g = (p) => num(val(lmt, p)), paid = g("PrepaidAmount"), incl = g("TaxInclusiveAmount"), rnd = g("PayableRoundingAmount");
      if (paid !== null && incl !== null && incl >= 0)
        rule("CHK-16", first(lmt, "PrepaidAmount"), paid <= incl, "Paid amount (BT-113) should not exceed the total with VAT (BT-112)", "paid " + fmt(paid) + (paid <= incl ? " ≤ " : " > ") + "total " + fmt(incl), true);
      if (rnd !== null) rule("CHK-17", first(lmt, "PayableRoundingAmount"), Math.abs(rnd) < 1, "Rounding amount (BT-114) should be less than 1", fmt(rnd), true);
    }

    // Parties
    const sellerIds = taxIds(seller, true), buyerIds = taxIds(buyer, true);
    if (sellerIds.length && buyerIds.length)
      rule("CHK-18", [seller, buyer], !sellerIds.some((v) => buyerIds.includes(v)), "Seller and buyer should have different VAT IDs", "seller " + sellerIds.join(", ") + " · buyer " + buyerIds.join(", "), true);
    const vatCountry = [[seller, "seller"], [buyer, "buyer"]].flatMap(([p, who]) => taxIds(p, true).map((v) => ({ el: p, name: who + " " + v, v,
      c: val(p, "PostalAddress/Country/IdentificationCode") })).filter((o) => o.c));
    each("CHK-19", vatCountry, (el, o) => o.v.slice(0, 2) === (o.c === "GR" ? "EL" : o.c), "VAT IDs should start with the country of the party’s address", true);
    each("CHK-20", items(allEls.filter((e) => e.localName === "ElectronicMail"), txt), (el) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(el)), "E-mail addresses must be well formed");

    // Payment account
    const iban = (s) => {
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
      const d = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => ch.charCodeAt(0) - 55);
      let r = 0;
      for (const ch of d) r = (r * 10 + +ch) % 97;
      return r === 1;
    };
    const accounts = byPath(R, "PaymentMeans/PayeeFinancialAccount/ID").map((e) => ({ el: e, name: txt(e), v: txt(e).replace(/\s+/g, "").toUpperCase() }));
    each("CHK-21", accounts.filter((o) => /^[A-Z]{2}\d{2}/.test(o.v)), (el, o) => iban(o.v), "IBANs (BT-84) must have a valid length and check digits");
    each("CHK-22", items(byPath(R, "PaymentMeans/PayeeFinancialAccount/FinancialInstitutionBranch/ID"), txt),
      (el) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(txt(el).toUpperCase()), "BIC codes (BT-86) must be 8 or 11 characters (bank, country, location, branch)");

    // ---------- Extra rule sets ----------
    // They get the same document model and reporting helpers as the rules above.
    const ctx = {
      R, cn, rule, cmp, each, terms, req, items, names, sum, has, val, first, byPath, txt, num, round, fmt, validDate, validCountry,
      lines, allows, charges, lineAllows, lineCharges, seller, buyer, payee, rep, taxIds, docCur, taxCur, taxTotals, vatTotal, vat, subs, lmt,
      allEls, typeCode, qtyTag, isCharge
    };
    (extraSets || []).forEach((id) => {
      if (!SETS[id]) return;
      setLabel = SETS[id].label;
      SETS[id].run(ctx);
    });
    return out;
  }

  window.EN16931 = { check, roundingInInclusive, register, detect, sets: SETS, util: { byPath, first, val, has, txt, num } };
})();
