/* eDocument Flow Tester – Running a step: check rows (EDOPROCCHKFLAG) and status changes (EDOPROCSETFLAG). */
"use strict";

/* ---------- running a step ---------- */

function procChecksFor(s) {
  return checks.filter(function (c) {
    return c.process === s.process && c.procVersion === s.procVersion && c.step === s.step && c.variant === s.variant;
  }).sort(function (a, b) { return a.seq - b.seq; });
}

// Status flags that keep one check row from matching.
function rowMisses(row, state) {
  var misses = [], i;
  for (i = 0; i < row.pattern.length; i++) {
    var c = row.pattern.charAt(i);
    if (c === "+" && !state[i]) { misses.push(nameAt(i + 1) + " not set"); }
    else if (c === "-" && state[i]) { misses.push(nameAt(i + 1) + " is set"); }
  }
  return misses;
}

// Tries the check rows of a step in sequence order against the current status.
// "none": the step has no EDOPROCCHKFLAG row, so the framework would not allow it.
function evalCheck(s, state) {
  state = state || cur;
  var rows = s.unchecked ? [] : procChecksFor(s), tries = [], r;
  if (!rows.length) { return { state: "none", tries: tries }; }
  for (r = 0; r < rows.length; r++) {
    var misses = rowMisses(rows[r], state);
    if (!misses.length) { return { state: "pass", row: rows[r], tries: tries }; }
    tries.push({ row: rows[r], misses: misses });
  }
  return { state: "blocked", tries: tries };
}

// Checks one sequence of a step (PROCESS, VERSION, STEP, VARIANT, SEQNR is the key of EDOPROCCHKFLAG).
// "first" is a lower sequence that also matches, i.e. the one the framework would pick.
function evalRow(s, row, state) {
  state = state || cur;
  var misses = rowMisses(row, state), first = evalCheck(s, state);
  return { state: misses.length ? "blocked" : "pass", row: row, misses: misses,
           first: first.state === "pass" && first.row.seq < row.seq ? first.row : null };
}

// 1. EDOPROCCHKFLAG: may the step run, and through which sequence / method variant?
//    Without a row, the sequences are tried in order; with a row, only that sequence is checked.
// 2. EDOPROCSETFLAG: the row of that method variant sets and clears the flags.
function runStep(s, row) {
  var ev = row ? evalRow(s, row) : evalCheck(s), chk;
  if (ev.state !== "pass" && $("enforce").checked) { return; }
  var via = ev.row || row || (s.unchecked ? null : procChecksFor(s)[0]) || null, set = effectOf(s, via);
  if (ev.state === "none") { chk = "no EDOPROCCHKFLAG row – the step would not be allowed (enforcement is off)"; }
  else if (ev.state === "pass") {
    chk = "check passed at sequence " + ev.row.seq + " → method variant " + (ev.row.method || "(blank)");
    if (ev.first) { chk += " (note: sequence " + ev.first.seq + " also matches and comes first)"; }
  } else if (row) {
    chk = "sequence " + row.seq + " would have BLOCKED this step (enforcement is off): " + ev.misses.join(", ");
  } else { chk = "check table would have BLOCKED this step (enforcement is off)"; }
  var pattern = set ? set.pattern : "";
  var L = statusLength(), before = cur.slice(), after = cur.slice(), changes = [], notes = [], i, unknown = false;
  while (before.length < L) { before.push(false); after.push(false); }
  for (i = 0; i < pattern.length && i < L; i++) {
    var c = pattern.charAt(i), pos = i + 1;
    if (c === "+") {
      if (after[i]) { notes.push({ t: "warn", x: nameAt(pos) + " was already set" }); }
      else { after[i] = true; changes.push({ pos: pos, kind: "set" }); }
    } else if (c === "-") {
      if (!after[i]) { notes.push({ t: "info", x: nameAt(pos) + " was already clear" }); }
      else { after[i] = false; changes.push({ pos: pos, kind: "clr" }); }
    } else if (c !== "o" && c !== "O") { unknown = true; }
  }
  if (unknown) { notes.push({ t: "warn", x: "pattern contains characters other than + - o (ignored)" }); }
  if (!set) {
    notes.push({ t: "warn", x: "no EDOPROCSETFLAG row for " + s.step + " / " + (via && via.method ? via.method : "(blank method variant)") + " – no flags changed" });
  } else if (!changes.length) { notes.push({ t: "warn", x: "this step changed nothing" }); }
  if (flagCfg && pattern.replace(/o+$/i, "").length > maxFlagPos()) {
    notes.push({ t: "warn", x: "pattern changes a position beyond the " + maxFlagPos() + " configured flags" });
  }
  hist.push({ label: stepLabel(s) + (via ? " · seq " + via.seq : "") + (set && set.variant ? " → " + set.variant : ""),
              ref: { step: s.step, variant: s.variant },
              before: before, after: after, changes: changes, notes: notes, expected: "", chk: chk });
  cur = after;
  lastChanges = changes;
  render();
}

function maxFlagPos() {
  var m = 0;
  procFlags().forEach(function (f) { if (f.pos > m) { m = f.pos; } });
  return m;
}

function restart() {
  var L = statusLength();
  cur = []; lastChanges = []; hist = [];
  while (cur.length < L) { cur.push(false); }
  render();
}

function undo() {
  if (!hist.length) { return; }
  hist.pop();
  cur = hist.length ? hist[hist.length - 1].after.slice() : [];
  lastChanges = hist.length ? hist[hist.length - 1].changes : [];
  while (cur.length < statusLength()) { cur.push(false); }
  render();
}
