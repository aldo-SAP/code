/* eDocument Flow Tester – Regression tests: saved routes replayed against the current tables. */
"use strict";

/* ---------- regression tests ---------- */

function parseTests(text) {
  var cases = [];
  text.split(/\r?\n/).forEach(function (raw, n) {
    var line = raw.trim();
    if (!line || line.charAt(0) === "#") { return; }
    var cells = line.split(",").map(function (c) { return c.replace(/["']/g, "").trim(); }).filter(Boolean);
    if (!cells.length) { return; }
    // a line is a route; "always, ..." names steps allowed anywhere. "positive" / "negative" come from
    // older files: positive is the same as a plain route, negative is covered by the route coverage.
    var first = cells[0].toLowerCase(), keyword = first === "always" || first === "positive" || first === "negative";
    var tc = { line: n + 1, raw: line, kind: first === "always" || first === "negative" ? first : "route", steps: [], invalid: "" };
    tc.steps = cells.slice(keyword ? 1 : 0).map(function (c) { var w = c.split(/\s+/); return { step: w[0], variant: w.slice(1).join(" ") }; });
    if (!tc.steps.length) { tc.invalid = "no steps after " + cells[0]; }
    cases.push(tc);
  });
  return cases;
}

function findStep(name, variant) {
  var f = null;
  procSteps().forEach(function (s) {
    if (s.step.toUpperCase() === name.toUpperCase() && s.variant.toUpperCase() === variant.toUpperCase()) { f = s; }
  });
  return f;
}

// Runs one case from an empty status without touching the screen state.
function runCase(tc) {
  var state = [], L = statusLength(), i;
  while (state.length < L) { state.push(false); }
  for (i = 0; i < tc.steps.length; i++) {
    var ref = tc.steps[i], st = findStep(ref.step, ref.variant), label = ref.step + (ref.variant ? " / " + ref.variant : "");
    if (!st) {
      var alt = procSteps().filter(function (x) { return x.step.toUpperCase() === ref.step.toUpperCase(); })
        .map(stepLabel);
      return { ok: false, at: i + 1, kind: "unknown",
               why: "step " + (i + 1) + " " + label + " does not exist in EDOPROCCHKFLAG" + (alt.length ? " (known variants: " + alt.join(", ") + ")" : "") };
    }
    var ev = evalCheck(st, state);
    if (ev.state !== "pass") {
      return { ok: false, at: i + 1, kind: "blocked",
               why: "step " + (i + 1) + " " + label + " blocked – " + (ev.state === "none" ? "no EDOPROCCHKFLAG row" : ev.tries.map(function (t) {
                 return "seq " + t.row.seq + ": " + t.misses.join(", ");
               }).join(" | ")) + " · status then: " + toStr(state) };
    }
    var set = effectOf(st, ev.row), pat = set ? set.pattern : "", k;
    for (k = 0; k < pat.length && k < state.length; k++) {
      if (pat.charAt(k) === "+") { state[k] = true; }
      else if (pat.charAt(k) === "-") { state[k] = false; }
    }
  }
  return { ok: true, final: toStr(state) };
}

var testCases = [];

function runTests() {
  var raw = $("testBox").value, $r = $("tcRows"), $sum = $("tcSum");
  testCases = parseTests(raw);
  if (!procKey) {
    $sum.hidden = false; $sum.className = "tc-sum bad"; $sum.textContent = "No process selected – load or paste steps first.";
    $r.innerHTML = ""; return;
  }
  var pass = 0, total = 0, rows = testCases.map(function (tc, i) {
    var stepsText = esc(tc.steps.map(function (x) { return x.step + (x.variant ? " " + x.variant : ""); }).join(", "));
    if (tc.kind === "always" && !tc.invalid) {
      return '<tr><td class="pos">' + (i + 1) + '</td><td class="tcline"><b>always</b>, ' + stepsText +
        '</td><td colspan="3" class="hint">allowed in any status – never reported as a leak</td></tr>';
    }
    if (tc.kind === "negative" && !tc.invalid) {
      return '<tr><td class="pos">' + (i + 1) + '</td><td class="tcline"><s>negative</s>, ' + stepsText +
        '</td><td colspan="3" class="hint">not needed any more – the route coverage below reports every move your routes do not use. You can delete this line.</td></tr>';
    }
    total++;
    var good, detail, r;
    if (tc.invalid) { good = false; detail = tc.invalid; }
    else {
      r = runCase(tc);
      good = r.ok;
      detail = r.ok ? "all " + tc.steps.length + " steps allowed · final status " + r.final : r.why;
    }
    if (good) { pass++; }
    tc.good = good;
    return '<tr class="' + (good ? "" : "fail") + '"><td class="pos">' + (i + 1) + '</td><td class="tcline">' +
      (tc.invalid ? esc(tc.raw) : stepsText) +
      '</td><td><span class="badge ' + (good ? "pass" : "fail") + '">' + (good ? "PASSES" : tc.invalid ? "INVALID" : "BLOCKED") + "</span></td><td>" +
      '<span class="note' + (good ? "" : " bad") + '">' + esc(detail) + '</span></td><td>' +
      (tc.invalid ? "" : '<button type="button" class="small" data-replay="' + i + '" title="Run this route in the flow above">Replay</button>') + "</td></tr>";
  });
  $r.innerHTML = rows.join("") || '<tr><td colspan="5" class="hint">No routes yet.</td></tr>';
  $sum.hidden = false;
  if (!total) { $sum.className = "tc-sum idle"; $sum.textContent = "No routes yet – write one per line, or take steps above and press Add current route."; }
  else if (pass === total) { $sum.className = "tc-sum ok"; $sum.textContent = "ALL " + pass + " ROUTES PASS"; }
  else { $sum.className = "tc-sum bad"; $sum.textContent = (total - pass) + " of " + total + " routes are blocked by the tables (" + pass + " pass)"; }
  renderCoverage(testCases);
}

function replay(tc) {
  restart();
  for (var i = 0; i < tc.steps.length; i++) {
    var st = findStep(tc.steps[i].step, tc.steps[i].variant);
    if (!st) { break; }
    var ev = evalCheck(st);
    if (ev.state !== "pass" && $("enforce").checked) { break; }
    runStep(st);
  }
  $steps.scrollIntoView && $steps.scrollIntoView({ block: "start" });
}
