/*
 * PINT AE (UAE) rules: the official Peppol PINT AE schematron, version 1.0.4 (billing and self-billing, invoice and credit note).
 *
 * All 302 asserts (170 of the PINT layer, 132 of the UAE layer) are in pint-ae-rules.js exactly as published; this file only runs them.
 * They are XPath 2 expressions, evaluated on the document with fontoxpath (rules/vendor), the way the official validator does:
 * for every node matching a rule's context, the first matching rule of a pattern checks its asserts.
 *
 * PINT AE is not EN 16931: it has its own semantic model, code lists and rules. With this rule set on, the EN 16931 and PEPPOL rules
 * are not applied (EN16931.check runs a "standalone" set alone).
 *
 * Needs, loaded before: en16931.js, vendor/fontoxpath.js, pint-ae-rules.js.
 */
(function () {
  "use strict";
  const DATA = window.PINT_AE_RULES, fx = window.fontoxpath;
  if (!DATA || !fx || !window.EN16931) return;
  const { val } = EN16931.util;

  const NS = {
    ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    qdt: "urn:oasis:names:specification:ubl:schema:xsd:QualifiedDataTypes-2",
    udt: "urn:oasis:names:specification:ubl:schema:xsd:UnqualifiedDataTypes-2",
    cn: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
    ubl: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    u: "utils",
    xs: "http://www.w3.org/2001/XMLSchema"
  };
  const OPTIONS = { namespaceResolver: (p) => (Object.prototype.hasOwnProperty.call(NS, p) ? NS[p] : null) };

  // ---------- The helper functions the schematron declares itself (namespace "utils") ----------
  const codes = (s) => Array.from(String(s || ""), (ch) => ch.codePointAt(0));
  const toNum = (s) => (/^\s*[-+]?(\d+(\.\d*)?|\.\d+)\s*$/.test(String(s)) ? parseFloat(s) : NaN);
  const isInt = (s) => /^\s*[-+]?\d+\s*$/.test(String(s));
  const scaled = (n) => Math.round(n * 1e6);
  const FUNCTIONS = {
    // exp ± slack must contain val (decimals, compared exactly at 6 places)
    slack: [["xs:decimal", "xs:decimal", "xs:decimal"], "xs:boolean", (e, v, s) => scaled(e) + scaled(s) >= scaled(v) && scaled(e) - scaled(s) <= scaled(v)],
    // GS1 GLN / GTIN check digit: weights 3,1,3… from the right over the digits before the check digit
    gln: [["xs:string?"], "xs:boolean", (v) => {
      v = v || ""; const length = v.length - 1;
      const digits = codes(v.substring(0, length)).map((c) => c - 48).reverse();
      const sum = digits.reduce((t, d, i) => t + d * (1 + (((i + 1) % 2) * 2)), 0);
      return (10 - (sum % 10)) % 10 === toNum(v.substr(length, 1));
    }],
    // mod 11 with weights 2..7 repeating
    mod11: [["xs:string?"], "xs:boolean", (v) => {
      v = v || ""; const length = v.length - 1;
      const digits = codes(v.substring(0, length)).map((c) => c - 48).reverse();
      const sum = digits.reduce((t, d, i) => t + d * ((i % 6) + 2), 0);
      return toNum(v) > 0 && (11 - (sum % 11)) % 11 === toNum(v.substr(length, 1));
    }],
    "mod97-0208": [["xs:string?"], "xs:boolean", (v) => {
      v = v || ""; const first8 = v.substring(0, 8);
      if (!isInt(first8)) throw new Error("mod97-0208: not an integer");
      return toNum(v.substr(8, 2)) === 97 - (parseInt(first8, 10) % 97);
    }],
    checkCodiceIPA: [["xs:string?"], "xs:boolean", (a) => /^[A-Za-z0-9]{6}$/.test(a || "")],
    checkCF: [["xs:string?"], "xs:boolean", (a) => { a = a || ""; return a.length === 16 ? checkCF16(a) : a.length === 11 ? isInt(a) : false; }],
    checkCF16: [["xs:string?"], "xs:boolean", (a) => checkCF16(a || "")],
    checkPIVAseIT: [["xs:string"], "xs:boolean", (a) => {
      const paese = a.substring(0, 2), codice = a.substring(2);
      if (paese !== "IT" && paese !== "it") return true;
      return codice.length === 11 && checkPIVA(codice) === 0;
    }],
    abn: [["xs:string?"], "xs:boolean", (v) => {
      v = v || ""; const W = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]; let sum = 0;
      for (let i = 0; i < 11; i++) { const ch = v.charCodeAt(i); if (isNaN(ch)) return false; sum += (ch - (i === 0 ? 49 : 48)) * W[i]; }
      return sum % 89 === 0;
    }]
  };
  function checkCF16(a) {
    const letters = (s) => /^[A-Za-z]*$/.test(s);
    return letters(a.substr(0, 6)) && isInt(a.substr(6, 2)) && letters(a.substr(8, 1)) && isInt(a.substr(9, 2)) && isInt(a.substr(14, 1)) && letters(a.substr(15, 1));
  }
  // Italian VAT number check digit (Luhn-like): every second digit, counted from the second, is replaced by "0246813579"[digit]
  function checkPIVA(a) {
    if (!isInt(a)) return 1;
    let total = 0, pari = 0;
    for (const ch of a.trim()) { const d = ch.charCodeAt(0) - 48; total += pari === 1 ? parseInt("0246813579".charAt(d), 10) : d; pari = 1 - pari; }
    return total % 10;
  }
  // fontoxpath accepts impossible dates such as 2026-02-30 as xs:date; Saxon (the official validator) does not
  FUNCTIONS.realDate = [["xs:string?"], "xs:boolean", (v) => {
    const m = /^(-?\d{4,})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(String(v || "").trim());
    if (!m) return false;
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return mo >= 1 && mo <= 12 && d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  }];
  const fixTest = (t) => t.replace(/\(string\(\.\) castable as xs:date\)/g, "(string(.) castable as xs:date and u:realDate(string(.)))");
  Object.keys(FUNCTIONS).forEach((name) => {
    const [params, ret, fn] = FUNCTIONS[name];
    fx.registerCustomXPathFunction({ namespaceURI: NS.u, localName: name }, params, ret, (_c, ...args) => fn(...args));
  });

  // ---------- Matching contexts ----------
  // A rule context is an XSLT match pattern; "//" + alternative selects the same nodes (absolute alternatives stay as they are).
  const splitUnion = (s) => {
    const parts = []; let depth = 0, quote = "", cur = "";
    for (const ch of s) {
      if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === "[" || ch === "(") depth++;
      if (ch === "]" || ch === ")") depth--;
      if (ch === "|" && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    parts.push(cur.trim());
    return parts.filter(Boolean);
  };
  const contextNodes = (doc, context, cache) => {
    if (cache.has(context)) return cache.get(context);
    const set = new Set();
    splitUnion(context).forEach((alt) => fx.evaluateXPathToNodes(alt.startsWith("/") ? alt : "//" + alt, doc, null, null, OPTIONS).forEach((n) => set.add(n)));
    const nodes = Array.from(set).sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    cache.set(context, nodes);
    return nodes;
  };
  const elementOf = (n) => (n.nodeType === 2 ? n.ownerElement : n.nodeType === 1 ? n : n.parentNode);

  // The rules in order: [{ id, flag, test, message, patternIndex, ruleIndex, context }]
  const ids = [];
  DATA.patterns.forEach((p) => p.r.forEach((r) => r.a.forEach((a) => ids.push(a[0]))));

  // XPath lets "A or B" be true when one operand is true even if the other raises an error (Saxon evaluates in either order):
  // when a test fails with an error, its top-level "or" operands are tried one by one
  const splitOr = (s) => {
    const parts = []; let depth = 0, quote = "", cur = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === "[" || ch === "(") depth++;
      if (ch === "]" || ch === ")") depth--;
      if (depth === 0 && /\s/.test(s[i - 1] || "") && s.substr(i, 2) === "or" && /\s/.test(s[i + 2] || "")) { parts.push(cur); cur = ""; i += 2; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map((x) => x.trim()).filter(Boolean);
  };
  function evalTest(test, node) {
    try { return fx.evaluateXPathToBoolean(fixTest(test), node, null, null, OPTIONS); } catch (e) {
      const alts = splitOr(test);
      if (alts.length > 1) {
        for (const alt of alts) { try { if (fx.evaluateXPathToBoolean(fixTest(alt), node, null, null, OPTIONS)) return true; } catch (e2) { /* next operand */ } }
      }
      throw e;
    }
  }

  function run(ctx) {
    const R = ctx.R, doc = R.ownerDocument, rule = ctx.rule;
    const selfBilling = /urn:peppol:pint:selfbilling-1@ae-1/i.test(val(R, "CustomizationID"));
    const cache = new Map();
    const results = new Map();   // assert id → { text, warn, failed: [elements], seen: n }
    const order = [];
    DATA.patterns.forEach((pattern) => {
      const done = new Set();    // a node is checked by the first rule of a pattern that matches it
      pattern.r.forEach((r) => {
        contextNodes(doc, r.c, cache).forEach((node) => {
          if (done.has(node)) return;
          done.add(node);
          r.a.forEach((a0) => {
            const a = selfBilling && DATA.selfBilling[a0[0]] ? DATA.selfBilling[a0[0]] : a0;
            let res = results.get(a[0]);
            if (!res) { res = { text: a[2], warn: a[3] !== "fatal", failed: [], detail: "", seen: 0 }; results.set(a[0], res); order.push(a[0]); }
            res.seen++;
            let ok;
            try { ok = evalTest(a[1], node); } catch (e) { ok = false; res.detail = "could not be evaluated: " + String(e.message || e).split("\n")[0]; }
            if (!ok) res.failed.push(elementOf(node));
          });
        });
      });
    });
    order.forEach((id) => {
      const res = results.get(id);
      const failed = res.failed.length > 0;
      rule(id, failed ? res.failed : R, !failed, res.text, failed ? (res.detail || (res.failed.length > 1 ? res.failed.length + " places" : "")) : "", res.warn);
    });
  }

  EN16931.register("ae", {
    label: "PINT AE",
    name: "PINT AE (UAE)",
    standalone: true,
    // the UAE profile identifiers of billing and self-billing
    detect: (R) => /urn:peppol:pint:(?:self)?billing-1@ae-1/i.test(val(R, "CustomizationID")),
    run
  });
  window.PintAE = { ids: Array.from(new Set(ids)), version: DATA.version };
})();
