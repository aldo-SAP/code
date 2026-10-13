/* eDocument Flow Tester – Shared state, helpers and the flags of the selected process. */
"use strict";

var RULE_NAME = { O: "Optional", M: "Mandatory", E: "Empty" };
var STEPS_FILE = "edoc_setflag_config.json";
var DATA_DIR = "../data/";   // where the shared config files live on the site

var steps = [];          // [{process, procVersion, step, variant, pattern}]
var checks = [];         // [{process, procVersion, step, variant, seq, pattern, method}]
var flagCfg = null;      // content of edoc_flag_config.json (names / rules), read-only
var procKey = "";        // "PROCESS|VERSION" currently selected
var cur = [];            // current status as array of booleans
var hist = [];           // [{label, before, after, changes, notes, expected}]
var lastChanges = [];
var stepChoices = [];    // buttons of "Choose the next step": [{st, row}]

function $(id) { return document.getElementById(id); }
var $sel = $("procSel"), $steps = $("steps"), $strip = $("strip"), $state = $("state"),
    $hist = $("hist"), $rows = $("rows"), $verdict = $("verdict"), $src = $("cfgSrc"), $msg = $("applyMsg");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function normVer(v) {
  v = String(v || "").trim();
  return /^\d+$/.test(v) ? ("0000" + v).slice(-Math.max(4, v.length)) : v;
}
function keyOf(p, v) { return p + "|" + v; }
function stepLabel(s) { return s.step + (s.variant ? " / " + s.variant : ""); }

/* ---------- flags of the selected process ---------- */

function mine(r) { return keyOf(r.process, r.procVersion) === procKey; }

// The steps you can run in the selected process: PROCESS_STEP + STEP_VARIANT of EDOPROCCHKFLAG.
// Their check rows decide whether the step may run and which method variant it uses; the
// EDOPROCSETFLAG row of that method variant (STEP + PROCMETH_VARIANT) then changes the flags.
// EDOPROCSETFLAG rows that no check row points to are listed too ("unchecked"), so they are not lost.
function procSteps() {
  var seen = {}, used = {}, list = [];
  checks.filter(mine).forEach(function (c) {
    used[c.step + "|" + c.method] = 1;
    if (seen[c.step + "|" + c.variant]) { return; }
    seen[c.step + "|" + c.variant] = 1;
    list.push({ process: c.process, procVersion: c.procVersion, step: c.step, variant: c.variant });
  });
  steps.filter(mine).forEach(function (s) {
    var k = s.step + "|" + s.variant;
    if (used[k] || seen[k]) { return; }
    seen[k] = 1;
    list.push({ process: s.process, procVersion: s.procVersion, step: s.step, variant: s.variant, unchecked: true, set: s });
  });
  return list.sort(function (a, b) { return stepLabel(a) < stepLabel(b) ? -1 : stepLabel(a) > stepLabel(b) ? 1 : 0; });
}

// The EDOPROCSETFLAG row of a step's method variant, or null (then the step changes no flags).
function setRowFor(s, method) {
  var f = null;
  steps.forEach(function (x) {
    if (x.process === s.process && x.procVersion === s.procVersion && x.step === s.step && x.variant === method) { f = x; }
  });
  return f;
}

// The EDOPROCSETFLAG row applied when step s runs through check row "row".
function effectOf(s, row) { return s.unchecked ? s.set : row ? setRowFor(s, row.method) : null; }

// Flags of a process ("PROCESS|VERSION", default: the selected one).
function procFlags(key) {
  if (!flagCfg) { return []; }
  var parts = (key || procKey).split("|"), exact = null, any = null;
  flagCfg.processes.forEach(function (p) {
    if (p.process === parts[0]) {
      if (!any) { any = p; }
      if (p.procVersion === parts[1]) { exact = p; }
    }
  });
  return (exact || any || { flags: [] }).flags;
}

function statusLength() {
  var m = 0;
  procFlags().forEach(function (f) { if (f.pos > m) { m = f.pos; } });
  steps.filter(mine).forEach(function (s) {   // trailing 'o' padding in a pattern is ignored
    var last = Math.max(s.pattern.lastIndexOf("+"), s.pattern.lastIndexOf("-")) + 1;
    if (last > m) { m = last; }
  });
  return m;
}

function flagAt(pos) {
  var f = null;
  procFlags().forEach(function (x) { if (x.pos === pos) { f = x; } });
  return f;
}
function nameAt(pos) { var f = flagAt(pos); return f ? f.flag : "#" + pos; }

function toStr(arr) {
  var out = "", i;
  for (i = 0; i < arr.length; i++) { out += arr[i] ? "X" : "o"; }
  return out;
}
