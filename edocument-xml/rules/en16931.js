/*
 * The rule engine: it runs the official EN 16931 rules and the rule sets of the countries (rules/ and countries/), and the viewer's own checks.
 *
 * The EN 16931 rules are the CEN validation artefacts (ConnectingEurope/eInvoicing-EN16931, UBL schematron: the business rules BR-, BR-CO-, BR-DEC-,
 * BR-S- … BR-B-, the syntax rules UBL-CR/DT/SR and the code lists BR-CL-): en16931-rules.js holds the asserts exactly as published and lib/schematron.js runs
 * them. The viewer's own checks (CHK-, FR-CHK-) are warnings about things the standard does not test; they are labelled as the tool's own.
 *
 * Usage: EN16931.check(rootElement, "Invoice" | "CreditNote", [rule set ids]) → [{ id, set, ok, warn, text, detail, at }]
 * `at` lists the elements the rule is about (the failing ones when it fails). Only rules whose condition the document triggers are returned.
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
  const exists = (ctx, path) => !!first(ctx, path);   // the element is there, even if empty (what the official exists() tests)
  function num(raw) { const s = String(raw).trim(); const n = Number(s); return s !== "" && isFinite(n) ? n : null; }
  const round = (x) => Math.round(x * 100) / 100;
  const fmt = (x) => round(x).toLocaleString(window.I18N ? I18N.locale() : undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // xs:date: YYYY-MM-DD that exists on the calendar, optionally followed by a time zone.
  function validDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  const validCountry = (c) => COUNTRY_CODES.has(c);

  const VATEX_CAT = { "VATEX-EU-AE": "AE", "VATEX-EU-D": "E", "VATEX-EU-F": "E", "VATEX-EU-I": "E", "VATEX-EU-J": "E",
    "VATEX-EU-G": "G", "VATEX-EU-IC": "K", "VATEX-EU-O": "O" };

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
  let base = null;   // the runner of the official EN 16931 rules, made on the first check

  // The check is a generator: it gives control back now and then (after each node of the official rules), so that a long document can be checked in
  // slices (checkAsync) instead of freezing the page. check() runs it to the end.
  function* checkSteps(R, kind, extraSets) {
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
      const ok = exp !== null && actual !== null && Math.abs(round(exp) - round(actual)) < (tol || 0.005);
      const off = ok || exp === null || actual === null ? "" : " (off by " + fmt(Math.abs(round(exp) - round(actual))) + ")";
      rule(id, at, ok, text, (calc ? calc + " = " : "") + (exp === null ? "?" : fmt(exp)) + (ok ? " = " : " ≠ ") + bt + " " + (actual === null ? "missing" : fmt(actual)) + off);
    };
    // The shape of the document first (the UBL 2.1 schema): the official validators check it before any business rule
    if (window.UblSchema) { setLabel = "UBL 2.1 schema"; UblSchema.report(R, rule); setLabel = "EN 16931"; }
    // A standalone rule set (PINT AE) replaces EN 16931: it runs alone, with its own model and rules.
    const alone = (extraSets || []).find((id) => SETS[id] && SETS[id].standalone);
    if (alone) { setLabel = SETS[alone].label; yield* runSet(SETS[alone], { R, cn, rule }); return out; }
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
    // Only a tax category of the VAT scheme counts, as in the official rules; hasCat/hasRate say whether the elements are there.
    const taxed = (o, taxPath, amtPath) => {
      const all = byPath(o.el, taxPath), catEl = all.find((c) => val(c, "TaxScheme/ID").toUpperCase() === "VAT") || null, src = catEl || all[0] || null;
      return Object.assign(o, {
        catEl, hasCat: !!(catEl && first(catEl, "ID")), hasRate: !!(catEl && first(catEl, "Percent")),
        cat: val(src, "ID"), rateRaw: val(src, "Percent"), rate: num(val(src, "Percent")), amt: num(val(o.el, amtPath))
      });
    };
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

    const taxedItems = lines.concat(allows, charges);
    const allEls = Array.from(R.getElementsByTagName("*"));
    const typeCode = val(R, cn ? "CreditNoteTypeCode" : "InvoiceTypeCode");

    // ---------- The official EN 16931 rules ----------
    setLabel = "EN 16931";
    if (!base) base = EdocSchematron.runner(window.EN16931_RULES);
    // The official asserts only say what is wrong; for the amount rules the detail adds the calculation with its numbers.
    const explain = (id, at) => {
      const g = (p) => (lmt ? num(val(lmt, p)) : null);
      const b106 = g("LineExtensionAmount"), b107 = g("AllowanceTotalAmount") || 0, b108 = g("ChargeTotalAmount") || 0;
      const b109 = g("TaxExclusiveAmount"), b112 = g("TaxInclusiveAmount"), b113 = g("PrepaidAmount") || 0, b114 = g("PayableRoundingAmount") || 0, b115 = g("PayableAmount");
      const eq = (calc, exp, bt, actual) => calc + " = " + (exp === null ? "?" : fmt(exp)) + " ≠ " + bt + " " + (actual === null ? "missing" : fmt(actual)) +
        (exp !== null && actual !== null ? " (off by " + fmt(Math.abs(round(exp) - round(actual))) + ")" : "");
      const vatsDoc = taxTotals.map((t) => first(t, "TaxAmount")).filter((e) => e && e.getAttribute("currencyID") === docCur);
      const vatDoc = vatsDoc.length === 1 ? num(txt(vatsDoc[0])) : null;
      const inIncl = roundingInInclusive(R);
      switch (id) {
        case "BR-CO-10": return eq(terms(lines, "amt"), sum(lines, "amt"), "BT-106", b106);
        case "BR-CO-11": return eq(terms(allows, "amt"), sum(allows, "amt"), "BT-107", g("AllowanceTotalAmount"));
        case "BR-CO-12": return eq(terms(charges, "amt"), sum(charges, "amt"), "BT-108", g("ChargeTotalAmount"));
        case "BR-CO-13": return b106 === null ? "BT-106 missing" : eq("BT-106 " + n(b106) + " − BT-107 " + n(b107) + " + BT-108 " + n(b108), b106 - b107 + b108, "BT-109", b109);
        case "BR-CO-14": {
          const t = at.find((e) => e.localName === "TaxTotal") || vatTotal;
          const parts = items(byPath(t, "TaxSubtotal"), (el, i) => "VAT breakdown " + (i + 1)).map((o) => Object.assign(o, { tax: num(val(o.el, "TaxAmount")) }));
          return eq(terms(parts, "tax"), sum(parts, "tax"), "BT-110", first(t, "TaxAmount") ? num(txt(first(t, "TaxAmount"))) : null);
        }
        case "BR-CO-15":
          if (vatsDoc.length !== 1) return vatsDoc.length + " VAT totals in the invoice currency found";
          return b109 === null ? "BT-109 missing" : eq("BT-109 " + n(b109) + " + BT-110 " + n(vatDoc) + (inIncl ? " + BT-114 " + n(b114) : ""), b109 + vatDoc + (inIncl ? b114 : 0), "BT-112", b112);
        case "BR-CO-16":
          return b112 === null ? "BT-112 missing" : eq("BT-112 " + n(b112) + " − BT-113 " + n(b113) + (inIncl || !b114 ? "" : " + BT-114 " + n(b114)), b112 - b113 + (inIncl ? 0 : b114), "BT-115", b115);
      }
      const sub = at.map((e) => (e.localName === "TaxSubtotal" ? e : e.parentNode)).find((e) => e && e.localName === "TaxSubtotal");
      const so = sub && subs.find((o) => o.el === sub);
      if (!so) return "";
      if (id === "BR-CO-17" || /^BR-(S|Z|E|AE|IC|G|O|L|M)-09$/.test(id)) {
        const pct = so.rate;
        if (so.tax === null) return "VAT amount missing";
        if (pct === null || (id !== "BR-CO-17" && /^BR-(Z|E|AE|IC|G|O)-/.test(id)) || Math.round(pct) === 0) return "BT-117 " + n(so.tax) + " at " + (so.rateRaw || "no") + " %";
        return eq("BT-116 " + n(so.amt) + " × " + so.rateRaw + " %", so.amt === null ? null : Math.abs(so.amt) * pct / 100, "BT-117", so.tax);
      }
      const m = /^BR-(S|Z|E|AE|IC|G|O|L|M)-08$/.exec(id);
      if (m) {
        const perRate = m[1] === "S" || m[1] === "L" || m[1] === "M";
        const match = (o) => o.cat === m[1] && (!perRate || (o.rate !== null && so.rate !== null && round(o.rate) === round(so.rate)));
        const L = lines.filter(match), A = allows.filter(match), C = charges.filter(match);
        if (!L.length && !A.length && !C.length) return "No line, allowance or charge is in " + m[1] + (perRate ? " at " + (so.rateRaw || "?") + " %" : "") + ", yet the breakdown taxes " + n(so.amt);
        const group = (list, label) => (list.length ? label + " (" + terms(list, "amt") + ")" : "");
        const plus = [group(L, "lines"), group(C, "charges")].filter(Boolean).join(" + ") || "0.00", minus = group(A, "allowances");
        return eq(plus + (minus ? " − " + minus : ""), sum(L, "amt") + sum(C, "amt") - sum(A, "amt"), "BT-116", so.amt);
      }
      return "";
    };
    yield* base.steps({
      R, cn,
      rule: (id, at, ok, text, detail, warn) => {
        let d = detail;
        if (!ok) { try { d = explain(id, [].concat(at || [])) || detail; } catch (e) { d = detail; } }
        rule(id, at, ok, text, d, warn);
      }
    });

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
    // The VATEX list ties some codes to one VAT category ("Only use with VAT category code …").
    const exCode = (el) => val(el, "TaxCategory/TaxExemptionReasonCode").toUpperCase();
    each("CHK-23", items(subs.filter((o) => VATEX_CAT[exCode(o.el)]).map((o) => o.el), (el) => exCode(el) + " with category " + (val(el, "TaxCategory/ID") || "?")),
      (el) => VATEX_CAT[exCode(el)] === val(el, "TaxCategory/ID"),
      "VAT exemption reason codes (BT-121) should match their VAT category (AE→AE, D/F/I/J→E, G→G, IC→K, O→O)", true);
    each("CHK-24", items(subs.filter((o) => /^\s*VATEX-/i.test(val(o.el, "TaxCategory/TaxExemptionReason"))).map((o) => o.el),
      (el) => val(el, "TaxCategory/TaxExemptionReason")), () => false,
      "VATEX codes belong in the exemption reason code (BT-121), not the reason text (BT-120)", true);

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
      R, cn, rule, cmp, each, terms, req, items, names, sum, has, val, first, byPath, txt, num, round, fmt, validDate,
      lines, allows, charges, lineAllows, lineCharges, seller, buyer, payee, rep, taxIds, docCur, taxCur, taxTotals, vatTotal, vat, subs, lmt,
      allEls, typeCode, qtyTag, isCharge,
      reported: (id) => out.some((x) => x.id === id)   // a set that repeats rules of another (XRechnung carries Peppol rules) skips the ones already reported
    };
    // in registration order, so the result does not depend on the order the sets were switched on
    for (const id of Object.keys(SETS).filter((id) => (extraSets || []).includes(id))) {
      setLabel = SETS[id].label;
      yield* runSet(SETS[id], ctx);
    }
    // A set can switch off rules of EN 16931 (the French EXTENDED-CTC-FR profile replaces part of them with its own: set.off(R) lists their ids)
    const off = new Set();
    Object.keys(SETS).filter((id) => (extraSets || []).includes(id) && SETS[id].off).forEach((id) => (SETS[id].off(R) || new Set()).forEach((x) => off.add(x)));
    return off.size ? out.filter((r) => !off.has(r.id)) : out;
  }

  const idsOf = (d) => Array.from(new Set([].concat(...d.patterns.map((p) => [].concat(...p.r.map((r) => r.a.map((a) => a[0])))))));
  // a rule set runs in steps when it has them (the ones made with lib/schematron.js do), else in one go
  function* runSet(set, ctx) { if (set.steps) yield* set.steps(ctx); else set.run(ctx); }
  function check(R, kind, extraSets) {
    const g = checkSteps(R, kind, extraSets);
    for (let r = g.next(); ; r = g.next()) if (r.done) return r.value;
  }
  // The same in slices of about `budget` ms, giving the browser the turn in between; resolves with the result.
  function checkAsync(R, kind, extraSets, budget) {
    const g = checkSteps(R, kind, extraSets), slice = budget || 40;
    return new Promise((resolve, reject) => {
      const go = () => {
        try {
          const t0 = performance.now();
          for (;;) { const r = g.next(); if (r.done) return resolve(r.value); if (performance.now() - t0 > slice) break; }
          setTimeout(go, 0);
        } catch (e) { reject(e); }
      };
      go();
    });
  }
  window.EN16931 = { check, checkAsync, roundingInInclusive, register, detect, sets: SETS, util: { byPath, first, val, has, txt, num },
    ids: window.EN16931_RULES ? idsOf(window.EN16931_RULES) : [], version: window.EN16931_RULES && window.EN16931_RULES.version };
})();
