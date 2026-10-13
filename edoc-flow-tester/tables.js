/* eDocument Flow Tester – Process selector, pasted table rows and loading / saving the steps file. */
"use strict";

/* ---------- process selector ---------- */

function fillSelect(keep) {
  var seen = {}, keys = [];
  steps.forEach(function (s) {
    var k = keyOf(s.process, s.procVersion);
    if (!seen[k]) { seen[k] = 0; keys.push(k); }
    seen[k]++;
  });
  checks.forEach(function (c) {             // a process may have check rows only
    var k = keyOf(c.process, c.procVersion);
    if (seen[k] === undefined) { seen[k] = 0; keys.push(k); }
  });
  keys.sort();
  if (!keys.length) {
    $sel.innerHTML = '<option value="">(no steps loaded)</option>';
    procKey = "";
    return;
  }
  $sel.innerHTML = keys.map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k.replace("|", " / ")) + " (" + seen[k] + " steps)</option>";
  }).join("");
  procKey = (keep && seen[keep] !== undefined) ? keep : keys[0];
  $sel.value = procKey;
}

/* ---------- pasted rows ---------- */

function splitLine(line) {
  line = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  if (line.indexOf("\t") !== -1) { return line.split("\t").map(function (c) { return c.trim(); }); }
  return line.trim().split(/\s+/);
}

// EDOPROCCHKFLAG: PROCESS VERSION PROCESS_STEP STEP_VARIANT SEQNR STATUS PROCMETH_VARIANT
// (variant and method variant may be empty; the sequence number followed by the status pattern anchors the row)
function checkAnchor(c) {
  for (var i = 4; i < c.length; i++) {
    if (/^\d+$/.test(c[i - 1]) && /^[+\-oO]+$/.test(c[i])) { return i; }
  }
  return -1;
}

function checkRow(c, k) {
  return { process: c[0], procVersion: normVer(c[1]), step: c[2], variant: k - 1 > 3 ? c[3] : "",
           seq: parseInt(c[k - 1], 10), pattern: c[k], method: c[k + 1] || "" };
}

// EDOPROCSETFLAG: PROCESS VERSION STEP VARIANT PATTERN. Lines with a sequence number before the
// pattern are EDOPROCCHKFLAG rows pasted into the wrong box; they come back in "checks".
function parsePasted(text) {
  var rows = [], checkRows = [], skipped = [];
  text.split(/\r?\n/).forEach(function (line) {
    if (!line.trim()) { return; }
    var c = splitLine(line), k = checkAnchor(c);
    if (c[0] && c[0].toUpperCase() === "PROCESS") { return; }          // header row
    if (k >= 0 && c[0] && c[2] && (line.indexOf("\t") !== -1 ? k >= 5 : c.length >= 5)) {
      checkRows.push(checkRow(c, k));
      return;
    }
    var pat = c.length ? c[c.length - 1] : "";
    if (c.length < 4 || !c[0] || !c[2] || !/^[+\-oO]+$/.test(pat)) { skipped.push(line.trim()); return; }
    rows.push({ process: c[0], procVersion: normVer(c[1]), step: c[2], variant: c.length >= 5 ? c[3] : "", pattern: pat });
  });
  return { rows: rows, checks: checkRows, skipped: skipped };
}

function parseChecks(text) {
  var rows = [], skipped = [];
  text.split(/\r?\n/).forEach(function (line) {
    if (!line.trim()) { return; }
    var c = splitLine(line), k = checkAnchor(c);
    if (c[0] && c[0].toUpperCase() === "PROCESS") { return; }
    if (k < 0 || !c[0] || !c[2]) { skipped.push(line.trim()); return; }
    rows.push(checkRow(c, k));
  });
  return { rows: rows, skipped: skipped };
}

function addMsg(list, cls, text) { list.push('<div class="m ' + cls + '">' + text + "</div>"); }

function applyPasted() {
  var res = parsePasted($("pasteBox").value), chkRes = parseChecks($("pasteChk").value),
      out = [], added = 0, replaced = 0, cAdded = 0, cReplaced = 0;
  if (!res.rows.length && !res.checks.length && !chkRes.rows.length) {
    addMsg(out, "err", "No valid rows found. SETFLAG: PROCESS, VERSION, STEP, VARIANT (may be empty), PATTERN. CHKFLAG: PROCESS, VERSION, STEP, VARIANT, SEQNR, STATUS, PROCMETH_VARIANT – separated by tabs.");
  }
  res.rows.forEach(function (r) {
    var found = -1;
    steps.forEach(function (s, i) {
      if (s.process === r.process && s.procVersion === r.procVersion && s.step === r.step && s.variant === r.variant) { found = i; }
    });
    if (found >= 0) { steps[found] = r; replaced++; } else { steps.push(r); added++; }
  });
  // The pasted sequences of a step are its whole check table: older sequences of that step are dropped.
  if (res.checks.length) { chkRes.rows = chkRes.rows.concat(res.checks); }
  var stepKey = function (r) { return [r.process, r.procVersion, r.step, r.variant].join("|"); };
  var pastedSteps = {}, oldSeqs = {}, removed = [];
  chkRes.rows.forEach(function (r) { pastedSteps[stepKey(r)] = 1; });
  checks = checks.filter(function (c) {
    if (!pastedSteps[stepKey(c)]) { return true; }
    oldSeqs[stepKey(c) + "|" + c.seq] = c;
    return false;
  });
  chkRes.rows.forEach(function (r) {
    var found = -1, k = stepKey(r) + "|" + r.seq;
    checks.forEach(function (c, i) { if (stepKey(c) + "|" + c.seq === k) { found = i; } });
    if (found >= 0) { checks[found] = r; return; }                       // same key twice in the paste
    checks.push(r);
    if (oldSeqs[k]) { cReplaced++; delete oldSeqs[k]; } else { cAdded++; }
  });
  Object.keys(oldSeqs).forEach(function (k) { removed.push(stepLabel(oldSeqs[k]) + " " + oldSeqs[k].seq); });
  if (res.rows.length) {
    addMsg(out, "ok", "EDOPROCSETFLAG: added " + added + " step" + (added === 1 ? "" : "s") + ", replaced " + replaced + ".");
  }
  if (res.checks.length) {
    addMsg(out, "warn", res.checks.length + " line(s) in the EDOPROCSETFLAG box have a sequence number, so they were read as EDOPROCCHKFLAG rows.");
  }
  if (chkRes.rows.length) {
    addMsg(out, "ok", "EDOPROCCHKFLAG: added " + cAdded + " row" + (cAdded === 1 ? "" : "s") + ", replaced " + cReplaced +
      (removed.length ? ", removed " + removed.length + " old sequence" + (removed.length === 1 ? "" : "s") + " not in the pasted rows (" +
        esc(removed.slice(0, 6).join(", ")) + (removed.length > 6 ? " …" : "") + ")" : "") + ".");
  }
  if (res.skipped.length) {
    addMsg(out, "warn", "EDOPROCSETFLAG: skipped " + res.skipped.length + " line(s) that could not be read: " +
      esc(res.skipped.slice(0, 3).join(" ¦ ")) + (res.skipped.length > 3 ? " …" : ""));
  }
  if (chkRes.skipped.length) {
    addMsg(out, "warn", "EDOPROCCHKFLAG: skipped " + chkRes.skipped.length + " line(s) that could not be read: " +
      esc(chkRes.skipped.slice(0, 3).join(" ¦ ")) + (chkRes.skipped.length > 3 ? " …" : ""));
  }
  var orphan = chkRes.rows.filter(function (r) {
    return !setRowFor(r, r.method);
  });
  if (orphan.length) {
    var names = {};
    orphan.forEach(function (r) { names[r.step + " / " + (r.method || "(blank)")] = 1; });
    addMsg(out, "warn", "Method variants without an EDOPROCSETFLAG row (those sequences change no flags): " + esc(Object.keys(names).slice(0, 6).join(", ")) + (Object.keys(names).length > 6 ? " …" : ""));
  }
  res.rows.forEach(function (r) {
    if (r.procVersion && !flagProcExists(r.process)) {
      var m = "No flag configuration for process " + esc(r.process) + " in edoc_flag_config.json – flag names and rules will be missing.";
      if (out.indexOf('<div class="m warn">' + m + "</div>") === -1) { addMsg(out, "warn", m); }
    }
  });
  $msg.innerHTML = out.join("");
  // a box whose lines were all read is emptied, so its table now shows the loaded rows
  if ((res.rows.length || res.checks.length) && !res.skipped.length) { $("pasteBox").value = ""; }
  if (chkRes.rows.length > res.checks.length && !chkRes.skipped.length) { $("pasteChk").value = ""; }
  if (res.rows.length || chkRes.rows.length) {
    var first = res.rows[0] || chkRes.rows[0];
    fillSelect(keyOf(first.process, first.procVersion));
    $src.textContent = "Unsaved changes – press Save steps JSON";
    restart();
  }
}

function flagProcExists(p) {
  return !!flagCfg && flagCfg.processes.some(function (x) { return x.process === p; });
}

/* ---------- load / save the steps file ---------- */

var fileHandle = null;
var JSON_TYPES = [{ description: "JSON", accept: { "application/json": [".json"] } }];

function stepsText() { return JSON.stringify({ schemaVersion: 2, steps: steps, checks: checks }, null, 2) + "\n"; }

function now() {
  var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return p(d.getHours()) + ":" + p(d.getMinutes());
}

function downloadCopy() {
  var blob = new Blob([stepsText()], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = STEPS_FILE;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

async function save() {
  var text = stepsText();
  if (window.showSaveFilePicker) {
    try {
      if (!fileHandle) { fileHandle = await window.showSaveFilePicker({ suggestedName: STEPS_FILE, types: JSON_TYPES }); }
      var perm = "granted";
      if (fileHandle.queryPermission) { perm = await fileHandle.queryPermission({ mode: "readwrite" }); }
      if (perm !== "granted" && fileHandle.requestPermission) { perm = await fileHandle.requestPermission({ mode: "readwrite" }); }
      if (perm !== "granted") { throw new Error("permission to write the file was denied"); }
      var w = await fileHandle.createWritable();
      await w.write(text); await w.close();
      $src.textContent = "Saved to " + fileHandle.name + " at " + now() + " – Save overwrites this file";
      return;
    } catch (e) {
      if (e && e.name === "AbortError") { return; }
      fileHandle = null;
      if (!(e && e.name === "SecurityError")) {
        $src.textContent = "Could not write the file (" + (e && e.message ? e.message : e) + ") – downloaded a copy instead";
        downloadCopy();
        return;
      }
    }
  }
  downloadCopy();
  $src.textContent = "Downloaded a copy – this browser cannot overwrite files directly";
}

function normalizeChecks(obj) {
  var out = [];
  (Array.isArray(obj.checks) ? obj.checks : []).forEach(function (c) {
    var pat = String((c && c.pattern) || ""), seq = parseInt(c && c.seq, 10);
    if (!c || !c.process || !c.step || !(seq >= 0) || !/^[+\-oO]+$/.test(pat)) { return; }
    out.push({ process: String(c.process), procVersion: normVer(c.procVersion), step: String(c.step),
               variant: String(c.variant || ""), seq: seq, pattern: pat, method: String(c.method || "") });
  });
  return out;
}

function normalizeSteps(obj) {
  if (!obj || !Array.isArray(obj.steps)) { throw new Error("JSON must contain a \"steps\" array."); }
  var out = [];
  obj.steps.forEach(function (s) {
    var pat = String((s && s.pattern) || "");
    if (!s || !s.process || !s.step || !/^[+\-oO]+$/.test(pat)) { return; }
    out.push({ process: String(s.process), procVersion: normVer(s.procVersion), step: String(s.step),
               variant: String(s.variant || ""), pattern: pat });
  });
  return out;
}

function loadSteps(text, name, handle) {
  try {
    var parsed = JSON.parse(text);
    steps = normalizeSteps(parsed);
    checks = normalizeChecks(parsed);
    fileHandle = handle || null;
    $src.textContent = "Loaded " + steps.length + " steps and " + checks.length + " check rows from " + name + (handle ? " – Save overwrites this file" : "");
    fillSelect(procKey);
    restart();
    $msg.innerHTML = "";
  } catch (e) {
    $msg.innerHTML = '<div class="m err">Could not load ' + esc(name) + ": " + esc(e.message) + "</div>";
    $("upd").open = true;
  }
}

async function openFile() {
  if (window.showOpenFilePicker) {
    try {
      var hs = await window.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      var f = await hs[0].getFile();
      loadSteps(await f.text(), f.name, hs[0]);
      return;
    } catch (e) {
      if (e && e.name === "AbortError") { return; }
    }
  }
  $("openFile").click();
}
