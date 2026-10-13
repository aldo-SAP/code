/* eDocument Flow Tester – Rendering of the step choices, status strip, history and rules. */
"use strict";

/* ---------- rendering ---------- */

// Flags an EDOPROCSETFLAG row sets and clears; "missing" explains a step that changes no flags.
function effectTags(set, missing) {
  if (!set) { return '<span class="hint">' + esc(missing || "no EDOPROCSETFLAG row") + " – changes no flags</span>"; }
  var sets = [], clrs = [], i;
  for (i = 0; i < set.pattern.length; i++) {
    if (set.pattern.charAt(i) === "+") { sets.push(nameAt(i + 1)); }
    else if (set.pattern.charAt(i) === "-") { clrs.push(nameAt(i + 1)); }
  }
  return sets.map(function (n) { return '<span class="tag set">+ ' + esc(n) + "</span>"; }).join("") +
         clrs.map(function (n) { return '<span class="tag clr">&minus; ' + esc(n) + "</span>"; }).join("") ||
         '<span class="hint">no change</span>';
}

function renderSteps() {
  var list = procSteps(), tokens = $("stepFilter").value.toLowerCase().split(/\s+/).filter(Boolean),
      onlyOk = $("onlyOk").checked, enforce = $("enforce").checked, html = [], hidden = 0;
  if (!list.length) {
    $steps.innerHTML = '<span class="hint">No steps for this process yet – paste rows from EDOPROCCHKFLAG and EDOPROCSETFLAG above.</span>';
    return;
  }
  // one choice per EDOPROCCHKFLAG key (step, variant, sequence); an unchecked EDOPROCSETFLAG row gets one choice
  stepChoices = [];
  list.forEach(function (st) {
    var rows = st.unchecked ? [] : procChecksFor(st);
    if (!rows.length) { stepChoices.push({ st: st, row: null }); }
    rows.forEach(function (r) { stepChoices.push({ st: st, row: r }); });
  });
  stepChoices.forEach(function (ch, i) {
    var st = ch.st, row = ch.row, set = effectOf(st, row);
    var hay = (st.step + " " + st.variant + (row ? " " + row.seq + " " + row.method : "")).toLowerCase();
    if (!tokens.every(function (t) { return hay.indexOf(t) !== -1; })) { hidden++; return; }
    var ev = row ? evalRow(st, row) : { state: "none" }, blocked = ev.state !== "pass", chk, tip = set ? set.pattern : "";
    if (onlyOk && blocked && enforce) { hidden++; return; }
    var method = row ? '<span class="meth">method variant ' + esc(row.method || "(blank)") + "</span>" : "";
    if (ev.state === "none") {
      chk = '<span class="chk no">&#10007; no EDOPROCCHKFLAG row – ' + (enforce ? "not allowed" : "would not be allowed") + "</span>";
    } else if (ev.state === "pass") {
      chk = '<span class="chk ok">&#10003; check passes' + (ev.first ? "<br>sequence " + ev.first.seq + " matches first" : "") + "</span>";
    } else {
      chk = '<span class="chk no">&#10007; ' + (enforce ? "blocked" : "would be blocked") + ": " +
        esc(ev.misses.slice(0, 2).join(", ")) + (ev.misses.length > 2 ? " …" : "") + "</span>";
      tip += "\n" + ev.misses.join(", ");
    }
    html.push('<button type="button" class="step' + (blocked && enforce ? " blocked" : "") + '" data-i="' + i + '"' +
      (blocked && enforce ? " disabled" : "") + ' title="' + esc(tip) + '"><b>' + esc(st.step) +
      (st.variant ? " <i>/ " + esc(st.variant) + "</i>" : "") + (row ? " <i>/ " + row.seq + "</i>" : "") + "</b>" + method +
      "<small>" + effectTags(set, row ? "no EDOPROCSETFLAG row for " + st.step + " / " + (row.method || "(blank)") : null) +
      "</small>" + chk + "</button>");
  });
  $steps.innerHTML = html.join("") ||
    '<span class="hint">No step matches the filter' + (onlyOk ? " / is possible right now" : "") + ".</span>";
}

function ruleFails(arr) {
  var out = [];
  procFlags().forEach(function (f) {
    var on = !!arr[f.pos - 1];
    if (f.rule === "M" && !on) { out.push(f); }
    if (f.rule === "E" && on) { out.push(f); }
  });
  return out;
}

function renderStatus() {
  var L = statusLength(), html = "", i;
  $state.textContent = L ? (hist.length ? "" : "") + toStr(cur) : "";
  if (!L) { $strip.innerHTML = '<span class="hint">Nothing to show yet.</span>'; return; }
  var failPos = {};
  ruleFails(cur).forEach(function (f) { failPos[f.pos] = true; });
  var chg = {};
  lastChanges.forEach(function (c) { chg[c.pos] = c.kind; });
  for (i = 0; i < L; i++) {
    var pos = i + 1;
    html += '<div class="cell' + (cur[i] ? " on" : "") + (chg[pos] === "set" ? " new" : "") +
      (chg[pos] === "clr" ? " gone" : "") + (failPos[pos] && hist.length ? " bad" : "") +
      '" title="' + esc(nameAt(pos)) + '">' + (cur[i] ? "X" : "o") + "<small>" + pos + "</small></div>";
  }
  $strip.innerHTML = html;
}

// expected: "X" / "+" = set, "?" = don't care, anything else = not set
function compare(actual, expected) {
  var diffs = [], L = Math.max(actual.length, expected.length), i;
  for (i = 0; i < L; i++) {
    var e = expected.charAt(i), a = !!actual[i];
    if (e === "?") { continue; }
    var want = (e === "X" || e === "x" || e === "+");
    if (want !== a) {
      diffs.push("#" + (i + 1) + " " + nameAt(i + 1) + ": expected " + (want ? "set" : "clear") + ", is " + (a ? "set" : "clear"));
    }
  }
  return diffs;
}

function matchHtml(h) {
  if (!h.expected.trim()) { return '<span class="badge skip">no expectation</span>'; }
  var d = compare(h.after, h.expected.replace(/\s/g, ""));
  if (!d.length) { return '<span class="badge pass">MATCH</span>'; }
  return '<span class="badge fail">' + d.length + " DIFFERENT</span>" +
    d.map(function (x) { return '<div class="note bad">' + esc(x) + "</div>"; }).join("");
}

function renderHist() {
  if (!hist.length) {
    $hist.innerHTML = '<tr><td colspan="5" class="hint">No step taken yet.</td></tr>';
    return;
  }
  $hist.innerHTML = hist.map(function (h, i) {
    var tags = h.changes.map(function (c) {
      return c.kind === "set" ? '<span class="tag set">+ ' + esc(nameAt(c.pos)) + "</span>"
                              : '<span class="tag clr">&minus; ' + esc(nameAt(c.pos)) + "</span>";
    }).join("");
    var notes = h.notes.map(function (n) {
      return '<div class="note' + (n.t === "warn" ? " warn" : "") + '">' + (n.t === "warn" ? "⚠ " : "") + esc(n.x) + "</div>";
    }).join("");
    return "<tr><td class=\"pos\">" + (i + 1) + "</td><td><span class=\"mono\">" + esc(h.label) + "</span><div>" + tags + "</div><div class=\"note\">" + esc(h.chk) + "</div>" + notes + "</td>" +
      "<td class=\"mono\">" + toStr(h.after) + '</td><td class="exp"><input type="text" spellcheck="false" autocomplete="off" data-i="' + i +
      '" value="' + esc(h.expected) + '" placeholder="XXooo..."></td><td id="m' + i + '">' + matchHtml(h) + "</td></tr>";
  }).join("");
}

function renderRules() {
  var flags = procFlags();
  if (!flags.length) {
    $rows.innerHTML = '<tr><td colspan="6" class="hint">No flag configuration found for this process (edoc_flag_config.json not loaded).</td></tr>';
    $verdict.className = "verdict idle";
    $verdict.innerHTML = "<div>Rule check not available.</div>";
    return;
  }
  var fails = ruleFails(cur);
  if (!hist.length) {
    $verdict.className = "verdict idle";
    $verdict.innerHTML = "<div>Take a step to start the check.</div>";
  } else if (!fails.length) {
    $verdict.className = "verdict ok";
    $verdict.innerHTML = "<div>PASSED – all mandatory flags are set and all &quot;empty&quot; flags are clear.</div>";
  } else {
    $verdict.className = "verdict bad";
    $verdict.innerHTML = "<div>FAILED – " + fails.length + " rule" + (fails.length > 1 ? "s" : "") + " not satisfied:<ul>" +
      fails.map(function (f) {
        return "<li>#" + f.pos + " " + esc(f.flag) + " – " + (f.rule === "M" ? "mandatory but not set" : "must be empty but is set") + "</li>";
      }).join("") + "</ul></div>";
  }
  $rows.innerHTML = flags.map(function (f) {
    var on = !!cur[f.pos - 1], st = "skip", txt = "not checked";
    if (f.rule === "M") { st = on ? "pass" : "fail"; }
    if (f.rule === "E") { st = on ? "fail" : "pass"; }
    if (st !== "skip") { txt = st === "pass" ? "OK" : "FAILED"; }
    if (!hist.length) { st = "skip"; txt = "–"; }
    return '<tr class="' + (st === "fail" ? "fail" : "") + '"><td class="pos">' + f.pos + '</td><td class="mono">' + esc(f.flag) +
      "</td><td>" + esc(f.description) + "</td><td>" + RULE_NAME[f.rule] + '</td><td class="mono">' + (on ? "X" : "o") +
      '</td><td><span class="badge ' + st + '">' + txt + "</span></td></tr>";
  }).join("");
}

function render() {
  renderSteps();
  renderStatus();
  renderHist();
  renderRules();
  renderPreview();
  $("undoBtn").disabled = !hist.length;
}
