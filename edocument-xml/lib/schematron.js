/*
 * Runs an official Schematron (as data: patterns, rules, asserts) on the document in the browser, the way the official validators do.
 *
 * The asserts are XPath 2 expressions kept exactly as published; they are evaluated with fontoxpath (lib/vendor). Following ISO Schematron,
 * a rule applies to the nodes its context matches, a node is checked by the first matching rule of a pattern only, and `let` variables
 * (global ones of the schema or a pattern, and the ones of a rule) are visible to the asserts of their scope.
 *
 * Data, as written by tests/gen-pint-ae.py and tests/gen-xrechnung.py:
 *   { version, lets: [[name, expr]], patterns: [{ id, r: [{ c: context, l: [[name, expr]], a: [[id, test, message, flag]] }] }] }
 * A message may contain \u0001 (the name of the checked node: <name/>) and \u0002xpath\u0003 (<value-of select="xpath"/>).
 *
 * EdocSchematron.runner(data, { skip }) returns { run({ R, rule }), ids }.
 */
(function () {
  "use strict";
  const fx = window.fontoxpath;
  if (!fx) return;

  const NS = {
    ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    qdt: "urn:oasis:names:specification:ubl:schema:xsd:QualifiedDataTypes-2",
    udt: "urn:oasis:names:specification:ubl:schema:xsd:UnqualifiedDataTypes-2",
    cn: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
    ubl: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "ubl-invoice": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "ubl-creditnote": "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
    u: "utils",
    xr: "xrechnung",
    xs: "http://www.w3.org/2001/XMLSchema"
  };
  const OPTIONS = { namespaceResolver: (p) => (Object.prototype.hasOwnProperty.call(NS, p) ? NS[p] : null) };

  // ---------- The helper functions the Peppol-based schematrons declare themselves (namespace "utils") ----------
  const codes = (s) => Array.from(String(s || ""), (ch) => ch.codePointAt(0));
  const toNum = (s) => (/^\s*[-+]?(\d+(\.\d*)?|\.\d+)\s*$/.test(String(s)) ? parseFloat(s) : NaN);
  const isInt = (s) => /^\s*[-+]?\d+\s*$/.test(String(s));
  const scaled = (n) => Math.round(n * 1e6);
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
    }],
    // fontoxpath accepts impossible dates such as 2026-02-30 as xs:date; Saxon (the official validator) does not
    realDate: [["xs:string?"], "xs:boolean", (v) => {
      const m = /^(-?\d{4,})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(String(v || "").trim());
      if (!m) return false;
      const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      return mo >= 1 && mo <= 12 && d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    }]
  };
  Object.keys(FUNCTIONS).forEach((name) => {
    const [params, ret, fn] = FUNCTIONS[name];
    fx.registerCustomXPathFunction({ namespaceURI: NS.u, localName: name }, params, ret, (_c, ...args) => fn(...args));
  });
  // functions a country's schematron declares itself: EdocSchematron.registerFunction("xr", "checkIBAN", ["xs:string"], "xs:boolean", fn)
  function registerFunction(prefix, localName, params, ret, fn) {
    fx.registerCustomXPathFunction({ namespaceURI: NS[prefix], localName }, params, ret, (_c, ...args) => fn(...args));
  }
  const fixTest = (t) => t.replace(/\(string\(\.\) castable as xs:date\)/g, "(string(.) castable as xs:date and u:realDate(string(.)))");

  // ---------- Text scanning ----------
  // Splits at a top-level separator: "|" (alternatives of a context) or " or "
  function splitTop(s, sep) {
    const parts = []; let depth = 0, quote = "", cur = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === "[" || ch === "(") depth++;
      if (ch === "]" || ch === ")") depth--;
      if (depth === 0) {
        if (sep === "|" && ch === "|") { parts.push(cur.trim()); cur = ""; continue; }
        if (sep === "or" && /\s/.test(s[i - 1] || "") && s.substr(i, 2) === "or" && /\s/.test(s[i + 2] || "")) { parts.push(cur.trim()); cur = ""; i += 2; continue; }
      }
      cur += ch;
    }
    parts.push(cur.trim());
    return parts.filter(Boolean);
  }
  // The variables an expression uses ($name), outside string literals
  function refs(expr) {
    const out = new Set(); let quote = "";
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === "$") { const m = /^[A-Za-z_][A-Za-z0-9_.\-]*/.exec(expr.slice(i + 1)); if (m) out.add(m[0]); }
    }
    return out;
  }
  const nameOf = (n) => (n.nodeType === 2 || n.nodeType === 1 ? n.nodeName : "");
  const elementOf = (n) => (n.nodeType === 2 ? n.ownerElement : n.nodeType === 1 ? n : n.parentNode);

  function runner(DATA, opts) {
    opts = opts || {};
    const globals = (DATA.lets || []).map((l) => ({ name: l[0], expr: l[1], global: true }));
    // Wraps an expression in `let $a := …, $b := … return (expr)` for the variables it needs: the global ones evaluate on the document
    // (as XSLT global variables do), the ones of a rule on the node being checked.
    function withLets(expr, locals) {
      const list = [], at = new Map();
      globals.concat((locals || []).map((l) => ({ name: l[0], expr: l[1], global: false }))).forEach((v) => {
        if (at.has(v.name)) list[at.get(v.name)] = v; else { at.set(v.name, list.length); list.push(v); }
      });
      const need = new Set(), stack = Array.from(refs(expr));
      while (stack.length) {
        const n = stack.pop();
        if (need.has(n) || !at.has(n)) continue;
        need.add(n); refs(list[at.get(n)].expr).forEach((r) => stack.push(r));
      }
      if (!need.size) return expr;
      return "let " + list.filter((v) => need.has(v.name)).map((v) => "$" + v.name + " := " + (v.global ? "root(.)/(" + v.expr + ")" : "(" + v.expr + ")")).join(", ") + " return (" + expr + ")";
    }
    const contextNodes = (doc, context, cache) => {
      if (cache.has(context)) return cache.get(context);
      const set = new Set();
      splitTop(context, "|").forEach((alt) => {
        const path = alt.startsWith("/") ? alt : "//" + alt;
        fx.evaluateXPathToNodes(withLets(path, null), doc, null, null, OPTIONS).forEach((n) => set.add(n));
      });
      const nodes = Array.from(set).sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      cache.set(context, nodes);
      return nodes;
    };
    // XPath lets "A or B" be true when one operand is true even if the other raises an error (Saxon evaluates in either order):
    // when a test fails with an error, its top-level "or" operands are tried one by one
    function evalTest(test, locals, node) {
      const go = (t) => fx.evaluateXPathToBoolean(withLets(fixTest(t), locals), node, null, null, OPTIONS);
      try { return go(test); } catch (e) {
        const alts = splitTop(test, "or");
        if (alts.length > 1) for (const alt of alts) { try { if (go(alt)) return true; } catch (e2) { /* next operand */ } }
        throw e;
      }
    }
    // the message of an assert, with <name/> and <value-of/> filled in for a node
    function message(template, locals, node) {
      return template.replace(/\u0001|\u0002([^\u0003]*)\u0003/g, (m, x) => {
        if (m === "\u0001") return nameOf(node);
        try { return String(fx.evaluateXPathToString(withLets(x, locals), node, null, null, OPTIONS)); } catch (e) { return ""; }
      }).replace(/\s+/g, " ").trim();
    }

    const ids = [];
    DATA.patterns.forEach((p) => p.r.forEach((r) => r.a.forEach((a) => ids.push(a[0]))));

    function run(ctx) {
      const R = ctx.R, doc = R.ownerDocument, rule = ctx.rule;
      const alt = opts.variant ? opts.variant(R) : null;     // e.g. the self-billing text of an assert
      const cache = new Map();
      const results = new Map();
      const order = [];
      DATA.patterns.forEach((pattern) => {
        const done = new Set();    // a node is checked by the first rule of a pattern that matches it
        pattern.r.forEach((r) => {
          contextNodes(doc, r.c, cache).forEach((node) => {
            if (done.has(node)) return;
            done.add(node);
            r.a.forEach((a0) => {
              const a = alt && alt[a0[0]] ? alt[a0[0]] : a0;
              if (opts.skip && opts.skip(a[0], ctx)) return;
              let res = results.get(a[0]);
              if (!res) { res = { template: a[2], locals: r.l, warn: a[3] !== "fatal", failed: [], detail: "", first: node, failNode: null }; results.set(a[0], res); order.push(a[0]); }
              let ok;
              try { ok = evalTest(a[1], r.l, node); } catch (e) { ok = false; res.detail = "could not be evaluated: " + String(e.message || e).split("\n")[0]; }
              if (!ok) { if (!res.failed.length) res.failNode = node; res.failed.push(elementOf(node)); }
            });
          });
        });
      });
      order.forEach((id) => {
        const res = results.get(id), failed = res.failed.length > 0;
        const text = message(res.template, res.locals, failed ? res.failNode : res.first);
        rule(id, failed ? res.failed : R, !failed, text, failed ? (res.detail || (res.failed.length > 1 ? res.failed.length + " places" : "")) : "", res.warn);
      });
    }
    return { run, ids: Array.from(new Set(ids)) };
  }

  window.EdocSchematron = { runner, registerFunction, splitTop };
})();
