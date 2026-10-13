/* eDocument Flow Tester – Tabs of the "SAP tables & files" box and the table view of pasted / loaded rows. */
"use strict";

/* ---------- tabs ---------- */

var TABS = ["set", "chk", "steps", "flags"];

function showTab(name) {
  TABS.forEach(function (t) {
    var on = t === name, tab = $("tab-" + t);
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.tabIndex = on ? 0 : -1;
    $("panel-" + t).hidden = !on;
  });
  $("pasteActions").hidden = !(name === "set" || name === "chk");
}

/* ---------- table view ---------- */

function flagName(key, pos) {
  var f = null;
  procFlags(key).forEach(function (x) { if (x.pos === pos) { f = x; } });
  return f ? f.flag : "#" + pos;
}

// names of the flags a pattern marks with + and with -
function patternNames(row) {
  var key = keyOf(row.process, row.procVersion), plus = [], minus = [], i;
  for (i = 0; i < row.pattern.length; i++) {
    if (row.pattern.charAt(i) === "+") { plus.push(flagName(key, i + 1)); }
    else if (row.pattern.charAt(i) === "-") { minus.push(flagName(key, i + 1)); }
  }
  return { plus: plus, minus: minus };
}

function patternHtml(p, title) {
  return '<span class="pat" title="' + esc(title) + '">' +
    esc(p).replace(/[+-]/g, function (c) { return '<b class="' + (c === "+" ? "p-set" : "p-clr") + '">' + c + "</b>"; }) + "</span>";
}

function badRows(lines, cols, why) {
  return lines.map(function (l) {
    return '<tr class="bad"><td colspan="' + cols + '"><b>' + why + ":</b> " + esc(l) + "</td></tr>";
  }).join("");
}

function previewTable(head, body, caption) {
  return '<p class="cap">' + caption + "</p>" +
    '<div class="wrap"><table class="rows"><thead><tr>' +
    head.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
    "</tr></thead><tbody>" + body + "</tbody></table></div>";
}

function setRowsHtml(rows) {
  return rows.map(function (r, i) {
    var n = patternNames(r);
    var eff = n.plus.map(function (x) { return '<span class="tag set">+ ' + esc(x) + "</span>"; }).join("") +
              n.minus.map(function (x) { return '<span class="tag clr">&minus; ' + esc(x) + "</span>"; }).join("");
    return "<tr><td class=\"pos\">" + (i + 1) + "</td><td>" + esc(r.process) + "</td><td>" + esc(r.procVersion) +
      '</td><td class="mono">' + esc(r.step) + '</td><td class="mono">' + esc(r.variant) + "</td><td>" +
      patternHtml(r.pattern, "set: " + (n.plus.join(", ") || "–") + "\nclear: " + (n.minus.join(", ") || "–")) +
      "</td><td>" + (eff || '<span class="hint">no change</span>') + "</td></tr>";
  }).join("");
}

function chkRowsHtml(rows) {
  return rows.map(function (r, i) {
    var n = patternNames(r);
    return "<tr><td class=\"pos\">" + (i + 1) + "</td><td>" + esc(r.process) + "</td><td>" + esc(r.procVersion) +
      '</td><td class="mono">' + esc(r.step) + '</td><td class="mono">' + esc(r.variant) + '</td><td class="mono">' + r.seq +
      "</td><td>" + patternHtml(r.pattern, "must be set: " + (n.plus.join(", ") || "–") + "\nmust be clear: " + (n.minus.join(", ") || "–")) +
      '</td><td class="mono">' + esc(r.method) + "</td></tr>";
  }).join("");
}

var SET_HEAD = ["#", "Process", "Version", "Step", "Method variant", "Pattern", "Effect"];
var CHK_HEAD = ["#", "Process", "Version", "Step", "Variant", "SeqNr", "Status", "Method variant"];

function bySeq(a, b) {
  return a.step < b.step ? -1 : a.step > b.step ? 1 : a.variant < b.variant ? -1 : a.variant > b.variant ? 1 : a.seq - b.seq;
}

// Shows what is in each paste box as a table; an empty box shows the rows loaded for the selected process.
function renderPreview() {
  var mine = function (r) { return keyOf(r.process, r.procVersion) === procKey; };
  var proc = procKey ? esc(procKey.replace("|", " / ")) : "no process";
  var loadedSet = steps.filter(mine), loadedChk = checks.filter(mine).sort(bySeq);
  $("nSet").textContent = loadedSet.length;
  $("nChk").textContent = loadedChk.length;

  var text = $("pasteBox").value, html;
  if (text.trim()) {
    var res = parsePasted(text);
    html = previewTable(SET_HEAD, setRowsHtml(res.rows) +
      badRows(res.checks.map(function (r) { return stepLabel(r) + " – sequence " + r.seq; }), SET_HEAD.length,
              "Has a sequence number – will be added as an EDOPROCCHKFLAG row") +
      badRows(res.skipped, SET_HEAD.length, "Cannot be read"),
      "Pasted: " + res.rows.length + " row" + (res.rows.length === 1 ? "" : "s") +
      (res.checks.length ? ", " + res.checks.length + " EDOPROCCHKFLAG row(s)" : "") +
      (res.skipped.length ? ", " + res.skipped.length + " unreadable" : "") + " – press <b>Apply pasted rows</b>");
  } else {
    html = previewTable(SET_HEAD, setRowsHtml(loadedSet),
      "Loaded for " + proc + ": " + loadedSet.length + " step" + (loadedSet.length === 1 ? "" : "s") + " – paste rows above to add or replace");
  }
  $("prevSet").innerHTML = html;

  text = $("pasteChk").value;
  if (text.trim()) {
    var cr = parseChecks(text);
    html = previewTable(CHK_HEAD, chkRowsHtml(cr.rows) + badRows(cr.skipped, CHK_HEAD.length, "Cannot be read"),
      "Pasted: " + cr.rows.length + " row" + (cr.rows.length === 1 ? "" : "s") +
      (cr.skipped.length ? ", " + cr.skipped.length + " unreadable" : "") + " – press <b>Apply pasted rows</b>");
  } else {
    html = previewTable(CHK_HEAD, chkRowsHtml(loadedChk),
      "Loaded for " + proc + ": " + loadedChk.length + " check row" + (loadedChk.length === 1 ? "" : "s") + " – paste rows above to add or replace");
  }
  $("prevChk").innerHTML = html;
}
