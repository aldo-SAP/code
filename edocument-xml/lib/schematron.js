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
  const resolverFor = (extra) => ({ namespaceResolver: (p) => (extra && Object.prototype.hasOwnProperty.call(extra, p) ? extra[p] : Object.prototype.hasOwnProperty.call(NS, p) ? NS[p] : null) });

  const declared = new Set();   // functions already registered ("namespace name")

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
    // Greek TIN: the first 8 digits weighted 256, 128 … 2; the check digit is that sum mod 11 mod 10 (a character that is no digit makes it fail)
    TinVerification: [["xs:string"], "xs:boolean", (v) => {
      const d = Array.from(v), n = (i) => (i < d.length && /^\d$/.test(d[i]) ? +d[i] : NaN);
      const sum = n(7) * 2 + n(6) * 4 + n(5) * 8 + n(4) * 16 + n(3) * 32 + n(2) * 64 + n(1) * 128 + n(0) * 256;
      return (sum % 11) % 10 === n(8);
    }],
    // Swedish organisation number: Luhn check digit over the first 9 digits
    checkSEOrgnr: [["xs:string"], "xs:boolean", (v) => {
      if (!/^\d+$/.test(v)) return false;
      const main = v.substring(0, 9), check = v.substring(9, 10);
      let sum = 0;
      for (let pos = 1; pos <= main.length; pos++) {
        const dgt = +main[main.length - pos];
        sum += pos % 2 === 1 ? ((dgt * 2) % 10) + Math.floor((dgt * 2) / 10) : dgt;
      }
      return /^\d$/.test(check) && (10 - (sum % 10)) % 10 === +check;
    }],
    // xs:integer(digits) mod n (also xs:decimal) for numbers longer than a double holds (the IBAN check of the Peppol rules): exact, with BigInt
    bigmod: [["xs:string", "xs:integer"], "xs:integer", (digits, n) => {
      if (/^\s*[-+]?\d*\.\d+\s*$/.test(digits)) return Number(digits) % n;
      if (!/^\s*[-+]?\d+\s*$/.test(digits)) throw new Error("FORG0001: cannot convert to a number: " + digits);
      const m = BigInt(digits.trim()) % BigInt(n);
      return Number(m < 0n ? m + BigInt(n) : m);
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
  // fn:sum of decimals: fontoxpath adds them as binary floating point (193.70 + 48.75 + 93.34 is not 335.79), Saxon adds them exactly.
  // u:sum takes the decimals as the text they were written in (the shortest text of the number) and adds those exactly.
  const decimalParts = (n) => {
    let t = Number.isInteger(n) && Math.abs(n) < 1e21 ? String(n) : n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
    if (/e/i.test(t)) t = n.toFixed(20);
    const neg = t[0] === "-"; if (neg) t = t.slice(1);
    const [i, f = ""] = t.split(".");
    return { int: BigInt(i + f), scale: f.length, neg };
  };
  FUNCTIONS.sum = [["xs:decimal*"], "xs:decimal", (xs) => {
    const parts = xs.map(decimalParts), scale = Math.max(0, ...parts.map((p) => p.scale));
    const total = parts.reduce((t, p) => t + (p.neg ? -1n : 1n) * p.int * 10n ** BigInt(scale - p.scale), 0n);
    return Number(total) / Math.pow(10, scale);
  }];
  Object.keys(FUNCTIONS).forEach((name) => {
    const [params, ret, fn] = FUNCTIONS[name];
    fx.registerCustomXPathFunction({ namespaceURI: NS.u, localName: name }, params, ret, (_c, ...args) => fn(...args));
  });
  // functions a country's schematron declares itself: EdocSchematron.registerFunction("xr", "checkIBAN", ["xs:string"], "xs:boolean", fn)
  // (it takes the place of the schematron's own xsl:function of that name, which fontoxpath could not evaluate exactly, e.g. big integers)
  function registerFunction(prefix, localName, params, ret, fn) {
    declared.add(NS[prefix] + " " + localName);
    fx.registerCustomXPathFunction({ namespaceURI: NS[prefix], localName }, params, ret, (_c, ...args) => fn(...args));
  }
  // xs:integer(E) mod N, xs:decimal(E) mod N  →  u:bigmod(E, N): find the matching parenthesis of every such call that is followed by "mod number"
  function bigMods(t) {
    let out = "", i = 0;
    for (;;) {
      const next = /xs:(?:integer|decimal)\(/g; next.lastIndex = i;
      const found = next.exec(t), at = found ? found.index : -1, open = found ? found[0].length : 0;
      if (at < 0) return out + t.slice(i);
      let depth = 0, quote = "", j = at + open - 1;
      for (; j < t.length; j++) {
        const ch = t[j];
        if (quote) { if (ch === quote) quote = ""; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === "(") depth++;
        if (ch === ")" && --depth === 0) break;
      }
      const m = /^\s*mod\s+(\d+)/.exec(t.slice(j + 1));
      if (j >= t.length || !m) { out += t.slice(i, at + open); i = at + open; continue; }
      out += t.slice(i, at) + "u:bigmod(" + bigMods(t.slice(at + open, j)) + ", " + m[1] + ")";
      i = j + 1 + m[0].length;
    }
  }
  const fixTest = (t) => bigMods(t).replace(/\(string\(\.\) castable as xs:date\)/g, "(string(.) castable as xs:date and u:realDate(string(.)))")
    .replace(/(^|[^\w:.$-])(?:fn:)?sum\(/g, "$1u:sum(");

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

  // The functions a schematron declares itself with xsl:function (a few parameters, variables and one expression): registered under their namespace,
  // each call evaluates the body with the arguments as variables.
  // The global variables a function body uses must be constants (the function has no document to look at).
  function declareFunctions(DATA, OPTIONS) {
    const consts = new Map((DATA.lets || []).map((l) => [l[0], l[1]]));
    (DATA.fns || []).forEach((f) => {
      const [prefix, localName] = f.name.split(":"), uri = (DATA.ns && DATA.ns[prefix]) || NS[prefix];
      if (!uri || declared.has(uri + " " + localName)) return;
      declared.add(uri + " " + localName);
      const need = new Set(), stack = [f.body].concat(f.vars.map((v) => v[1])).flatMap((x) => Array.from(refs(x)));
      while (stack.length) { const n = stack.pop(); if (need.has(n) || !consts.has(n)) continue; need.add(n); refs(consts.get(n)).forEach((r) => stack.push(r)); }
      const lets = Array.from(need).map((n) => [n, consts.get(n)]).concat(f.vars);
      const body = (lets.length ? "let " + lets.map((v) => "$" + v[0] + " := (" + v[1] + ")").join(", ") + " return " : "") + "(" + f.body + ")";
      const types = f.params.map((p) => p[1]);
      if ((f.ret || "xs:boolean") !== "xs:boolean") throw new Error("only boolean functions are supported: " + f.name);
      fx.registerCustomXPathFunction({ namespaceURI: uri, localName }, types, "xs:boolean", (_c, ...args) => {
        const vars = {}; f.params.forEach((p, i) => { vars[p[0]] = args[i]; });
        return fx.evaluateXPathToBoolean(body, null, null, vars, OPTIONS);
      });
    });
  }

  // ---------- A fast path for the UBL structure rules ----------
  // About half of the EN 16931 asserts say that something must not be there: not(cac:A/cac:B/cbc:C), not((cac:A | cac:B)/cbc:C) or count(cac:A/cac:B) <= 1,
  // tested on the document element. Asked one by one they make the engine walk the children of the root again and again (an invoice with 100 lines takes
  // seconds), so the document is walked once: for every element the path of its names from the root, and how many there are. Every other assert goes to XPath.
  const STEP = /^[A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*$/;
  function parsePath(src, uri) {
    const parts = []; let depth = 0, cur = "";
    for (const ch of src) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "/" && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch; }
    parts.push(cur.trim());
    const steps = parts.map((p) => {
      const names = (/^\(.*\)$/.test(p) ? p.slice(1, -1).split("|") : [p]).map((x) => x.trim());
      if (!names.every((x) => STEP.test(x))) return null;
      const ns = names.map((x) => { const u = uri(x.split(":")[0]); return u ? u + "|" + x.split(":")[1] : null; });
      return ns.every(Boolean) ? ns : null;
    });
    return steps.every(Boolean) ? steps : null;
  }
  // [alternatives of keys] of a path of steps with alternatives
  function keysOf(steps) { return steps.reduce((keys, alts) => [].concat(...keys.map((k) => alts.map((a) => k + "/" + a))), [""]); }
  function fastTest(test, uri) {
    let m = /^not\((.*)\)$/.exec(test.trim());
    if (m) { const steps = parsePath(m[1], uri); if (steps) { const keys = keysOf(steps); return (ix) => !keys.some((k) => ix.has(k)); } }
    m = /^\(count\((.*)\)\s*<=\s*(\d+)\)$/.exec(test.trim());
    if (m) { const steps = parsePath(m[1], uri); if (steps) { const keys = keysOf(steps), n = +m[2]; return (ix) => keys.reduce((t, k) => t + (ix.get(k) || 0), 0) <= n; } }
    return null;
  }
  function indexOf(root) {
    const ix = new Map();
    (function walk(el, key) { for (const c of el.children) { const k = key + "/" + c.namespaceURI + "|" + c.localName; ix.set(k, (ix.get(k) || 0) + 1); walk(c, k); } })(root, "");
    return ix;
  }

  function runner(DATA, opts) {
    opts = opts || {};
    const OPTIONS = resolverFor(DATA.ns);
    declareFunctions(DATA, OPTIONS);
    const globals = (DATA.lets || []).map((l) => ({ name: l[0], expr: l[1], global: true }));
    // Wraps an expression in `let $a := …, $b := … return (expr)` for the variables it needs: the global ones evaluate on the document
    // (as XSLT global variables do), the ones of a rule on the node being checked.
    function withLets(expr, locals, onDocument) {
      const list = [], at = new Map();
      globals.concat((locals || []).map((l) => ({ name: l[0], expr: l[1], global: !!onDocument || l[2] === "doc" }))).forEach((v) => {
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
    // A step of the context that raises an error on one node (a predicate comparing a badly typed value, say) must not hide the other nodes:
    // in XSLT such a node simply does not match. So the path is walked one step at a time and node by node, the nodes with an error left out.
    function stepwise(path, doc, plets) {
      const parts = []; let depth = 0, quote = "", cur = "";
      for (let i = 0; i < path.length; i++) {
        const ch = path[i];
        if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
        if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
        if (ch === "(" || ch === "[") depth++;
        if (ch === ")" || ch === "]") depth--;
        if (ch === "/" && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      // "//a/b" splits as ["", "", "a", "b"]; "/ubl:Invoice/cac:X" as ["", "ubl:Invoice", "cac:X"]
      let nodes = [doc], descend = false, k = 0;
      if (parts[0] === "") k = 1;
      for (; k < parts.length; k++) {
        if (parts[k] === "") { descend = true; continue; }
        // the name test first, then each predicate on each candidate alone, so that an error stays with the node that causes it
        const br = parts[k].indexOf("["), base = br < 0 ? parts[k] : parts[k].slice(0, br), preds = br < 0 ? "" : parts[k].slice(br);
        const step = (descend ? "descendant-or-self::node()/" : "") + base;
        let cand = new Set();
        nodes.forEach((n) => {
          try { fx.evaluateXPathToNodes(withLets(step, plets, true), n, null, null, OPTIONS).forEach((m) => cand.add(m)); } catch (e) { /* this node does not match */ }
        });
        if (preds) {
          const kept = new Set();
          cand.forEach((n) => { try { if (fx.evaluateXPathToNodes(withLets("." + preds, plets, true), n, null, null, OPTIONS).length) kept.add(n); } catch (e) { /* no match */ } });
          cand = kept;
        }
        nodes = Array.from(cand); descend = false;
      }
      return nodes;
    }
    const contextNodes = (doc, context, cache, plets) => {
      const t0 = window.EDOC_PROFILE ? performance.now() : 0;
      const key = context + "\u0000" + (plets && plets.length ? plets.map((l) => l[0]).join(",") : "");
      if (cache.has(key)) return cache.get(key);
      const set = new Set();
      splitTop(context, "|").forEach((alt) => {
        const path = alt.startsWith("/") ? alt : "//" + alt;
        try { fx.evaluateXPathToNodes(withLets(path, plets, true), doc, null, null, OPTIONS).forEach((n) => set.add(n)); }
        catch (e) { stepwise(path, doc, plets).forEach((n) => set.add(n)); }
      });
      const nodes = Array.from(set).sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      cache.set(key, nodes);
      if (window.EDOC_PROFILE) { const e = window.EDOC_PROFILE.get("context") || [0, 0]; e[0] += performance.now() - t0; e[1]++; window.EDOC_PROFILE.set("context", e); }
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
    // the message of an assert, with <name/> and <value-of/> filled in for a node (the text of the message was normalized when the data was made;
    // the values are kept as they are, with runs of white space made one space, so an empty value leaves the spaces around it)
    function message(template, locals, node) {
      return template.replace(/\u0001|\u0002([^\u0003]*)\u0003/g, (m, x) => {
        if (m === "\u0001") return nameOf(node);
        try { return String(fx.evaluateXPathToString(withLets(x, locals), node, null, null, OPTIONS)).replace(/\s+/g, " ").trim(); } catch (e) { return ""; }
      }).trim();
    }

    const ids = [];
    DATA.patterns.forEach((p) => p.r.forEach((r) => r.a.forEach((a) => ids.push(a[0]))));

    // The asserts of one rule on one node go to the engine in a single expression (one compile, one call): "(string(boolean(E1)), string(boolean(E2)), …)".
    // When one of them raises an error the asserts are evaluated one by one, as the official stylesheet would report each on its own.
    const fastOf = new Map();   // assert test → its fast form, or null
    const uri = (p) => (DATA.ns && DATA.ns[p]) || NS[p];
    function evalAll(asserts, locals, node, ix) {
      if (ix) {   // the document element, with the index of its paths: the structure asserts are answered from it
        const answer = new Array(asserts.length);
        const rest = [];
        asserts.forEach((a, k) => {
          if (!fastOf.has(a[1])) fastOf.set(a[1], fastTest(a[1], uri));
          const f = fastOf.get(a[1]);
          if (f) answer[k] = { ok: f(ix) }; else rest.push(k);
        });
        if (rest.length) evalAll(rest.map((k) => asserts[k]), locals, node).forEach((o, i) => { answer[rest[i]] = o; });
        return answer;
      }
      if (asserts.length > 1) {
        try {
          const list = fx.evaluateXPathToStrings(withLets("(" + asserts.map((a) => "string(boolean(" + fixTest(a[1]) + "))").join(", ") + ")", locals), node, null, null, OPTIONS);
          if (list.length === asserts.length) return list.map((v) => ({ ok: v === "true" }));
        } catch (e) { /* one by one */ }
      }
      return asserts.map((a) => {
        try { return { ok: evalTest(a[1], locals, node) }; } catch (e) { return { ok: false, detail: "could not be evaluated: " + String(e.message || e).split("\n")[0] }; }
      });
    }

    // The work is a generator that yields after every node it has checked, so a page can run it in slices (EN16931.checkAsync) and stay responsive;
    // run() runs it to the end.
    const CHUNK = 12;
    function* steps(ctx) {
      const R = ctx.R, doc = R.ownerDocument, rule = ctx.rule;
      const alt = opts.variant ? opts.variant(R) : null;     // e.g. the self-billing text of an assert
      const cache = new Map();
      const results = new Map();
      const order = [];
      let rootIndex = null;
      for (const pattern of DATA.patterns) {
        const done = new Set();    // a node is checked by the first rule of a pattern that matches it
        const plets = (pattern.l || []).map((l) => [l[0], l[1], "doc"]);
        for (const r of pattern.r) {
          const asserts = r.a.map((a0) => (alt && alt[a0[0]] ? alt[a0[0]] : a0)).filter((a) => !(opts.skip && opts.skip(a[0], ctx)));
          // a context that cannot be evaluated (a value of the wrong type in a predicate, say) matches nothing: the rule does not apply, as in XSLT
          let nodes;
          try { nodes = contextNodes(doc, r.c, cache, pattern.l); } catch (e) { nodes = []; }
          const locals = plets.concat(r.l || []);   // the lets of a pattern evaluate on the document, the ones of a rule on the node
          for (const node of nodes) {
            if (done.has(node)) continue;
            done.add(node);
            if (!asserts.length) continue;
            const t0 = window.EDOC_PROFILE ? performance.now() : 0;   // the tests can set window.EDOC_PROFILE = new Map() to see where the time goes
            if (node === R && !rootIndex) rootIndex = indexOf(R);
            // a context with many asserts (the document element has hundreds) is evaluated a few at a time, so that a page can run between the parts
            let oks;
            if (asserts.length <= CHUNK) oks = evalAll(asserts, locals, node, node === R ? rootIndex : null);
            else {
              oks = [];
              for (let k = 0; k < asserts.length; k += CHUNK) {
                oks.push(...evalAll(asserts.slice(k, k + CHUNK), locals, node, node === R ? rootIndex : null));
                yield;
              }
            }
            if (window.EDOC_PROFILE) { const e = window.EDOC_PROFILE.get(r.c.slice(0, 60)) || [0, 0]; e[0] += performance.now() - t0; e[1]++; window.EDOC_PROFILE.set(r.c.slice(0, 60), e); }
            asserts.forEach((a, k) => {
              let res = results.get(a[0]);
              if (!res) { res = { template: a[2], locals, warn: a[3] !== "fatal", failed: [], detail: "", first: node, failNode: null }; results.set(a[0], res); order.push(a[0]); }
              if (oks[k].detail) res.detail = oks[k].detail;
              if (!oks[k].ok) { if (!res.failed.length) res.failNode = node; res.failed.push(elementOf(node)); }
            });
            yield;
          }
        }
      }
      order.forEach((id) => {
        const res = results.get(id), failed = res.failed.length > 0;
        const text = message(res.template, res.locals, failed ? res.failNode : res.first);
        rule(id, failed ? res.failed : R, !failed, text, failed ? (res.detail || (res.failed.length > 1 ? res.failed.length + " places" : "")) : "", res.warn);
      });
    }
    const run = (ctx) => { for (const _ of steps(ctx)); };
    return { run, steps, ids: Array.from(new Set(ids)), probe: evalTest, contextNodes: (doc, c) => contextNodes(doc, c, new Map(), null) };
  }

  window.EdocSchematron = { runner, registerFunction, splitTop };
})();
