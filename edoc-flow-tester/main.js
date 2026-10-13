/* eDocument Flow Tester – Event wiring and start-up. */
"use strict";

/* ---------- events ---------- */

$steps.addEventListener("click", function (e) {
  var b = e.target.closest ? e.target.closest("button.step") : null;
  if (b) { var ch = stepChoices[Number(b.getAttribute("data-i"))]; runStep(ch.st, ch.row); }
});
$hist.addEventListener("input", function (e) {
  var t = e.target;
  if (t && t.getAttribute && t.getAttribute("data-i") !== null) {
    var i = Number(t.getAttribute("data-i"));
    hist[i].expected = t.value;
    $("m" + i).innerHTML = matchHtml(hist[i]);
  }
});
$sel.addEventListener("change", function () { procKey = $sel.value; restart(); });
$("stepFilter").addEventListener("input", renderSteps);
$("onlyOk").addEventListener("change", renderSteps);
$("enforce").addEventListener("change", renderSteps);
$("copyBtn").addEventListener("click", function () {
  var lines = hist.map(function (h, i) {
    return (i + 1) + ". " + h.label + "  [" + h.chk + "]  → " + toStr(h.after);
  });
  var text = procKey.replace("|", " / ") + "\n" + (lines.join("\n") || "(no steps yet)");
  var done = function () { $("copyNote").textContent = "Route copied."; };
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy the route:", text); }); }
  else { window.prompt("Copy the route:", text); }
});
$("runTests").addEventListener("click", runTests);
$("tcRows").addEventListener("click", function (e) {
  var b = e.target.closest ? e.target.closest("button[data-replay]") : null;
  if (b) { replay(testCases[Number(b.getAttribute("data-replay"))]); }
});
$("ignoreNoop").addEventListener("change", runTests);
$("covOut").addEventListener("click", function (e) {
  var b = e.target.closest ? e.target.closest("button[data-leak], button[data-dead]") : null;
  if (!b) { return; }
  if (b.hasAttribute("data-dead")) { replay(pathCase(covDead[Number(b.getAttribute("data-dead"))].path)); return; }
  var leak = covLeaks[Number(b.getAttribute("data-leak"))];
  if (b.getAttribute("data-act") === "replay") { replay(pathCase(leak.path)); return; }
  var box = $("testBox");
  box.value = box.value.replace(/\s*$/, "") + (box.value.trim() ? "\n" : "") + routeText(leak.path) + "\n";
  runTests();
});
$("loadTests").addEventListener("click", function () { $("testFile").click(); });
$("testFile").addEventListener("change", function () {
  var file = this.files && this.files[0];
  if (file) {
    var reader = new FileReader();
    reader.onload = function () { $("testBox").value = reader.result; runTests(); };
    reader.readAsText(file);
  }
  this.value = "";
});
$("saveTests").addEventListener("click", function () {
  var blob = new Blob([$("testBox").value.replace(/\s*$/, "") + "\n"], { type: "text/csv" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "edoc_flow_tests.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
});
$("addRoute").addEventListener("click", function () {
  if (!hist.length) { return; }
  var line = hist.map(function (h) { return h.ref.step + (h.ref.variant ? " " + h.ref.variant : ""); }).join(", ");
  var box = $("testBox");
  box.value = box.value.replace(/\s*$/, "") + (box.value.trim() ? "\n" : "") + line + "\n";
});
$("undoBtn").addEventListener("click", undo);
$("resetBtn").addEventListener("click", restart);
$("applyBtn").addEventListener("click", applyPasted);
$("clearBox").addEventListener("click", function () {
  $("pasteBox").value = ""; $("pasteChk").value = ""; $msg.innerHTML = ""; renderPreview();
});
$("pasteBox").addEventListener("input", renderPreview);
$("pasteChk").addEventListener("input", renderPreview);
document.querySelector("#upd .tabs").addEventListener("click", function (e) {
  var b = e.target.closest ? e.target.closest('[role="tab"]') : null;
  if (b) { showTab(b.id.replace("tab-", "")); }
});
document.querySelector("#upd .tabs").addEventListener("keydown", function (e) {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") { return; }
  var i = TABS.indexOf(document.activeElement.id.replace("tab-", ""));
  if (i < 0) { return; }
  var next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
  showTab(next); $("tab-" + next).focus(); e.preventDefault();
});
$("clearAll").addEventListener("click", function () {
  steps = []; checks = []; fillSelect(""); restart();
  $src.textContent = "Unsaved changes – press Save steps JSON";
});
$("saveBtn").addEventListener("click", save);
$("openBtn").addEventListener("click", openFile);
$("openFile").addEventListener("change", function () {
  var file = this.files && this.files[0];
  if (file) {
    var reader = new FileReader();
    reader.onload = function () { loadSteps(reader.result, file.name, null); };
    reader.readAsText(file);
  }
  this.value = "";
});

$("flagBtn").addEventListener("click", function () { $("flagFile").click(); });
$("flagFile").addEventListener("change", function () {
  var file = this.files && this.files[0];
  if (file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var c = JSON.parse(reader.result);
        if (!c || !Array.isArray(c.processes)) { throw new Error("no \"processes\" array"); }
        flagCfg = c; restart();
        $("flagSrc").textContent = "Loaded from " + file.name + " (" + c.processes.length + " processes)";
        $msg.innerHTML = '<div class="m ok">Flag config loaded from ' + esc(file.name) + ".</div>";
      } catch (e) {
        $msg.innerHTML = '<div class="m err">Could not load ' + esc(file.name) + ": " + esc(e.message) + "</div>";
        $("upd").open = true;
      }
    };
    reader.readAsText(file);
  }
  this.value = "";
});

/* ---------- start ---------- */

showTab("set");
render();
$("flagSrc").textContent = "Loading…";
$src.textContent = "Loading " + STEPS_FILE + "…";

if (window.fetch) {
  // flag names / rules (read-only, shared with the Status Checker page)
  fetch(DATA_DIR + "edoc_flag_config.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); })
    .then(function (c) {
      if (c && Array.isArray(c.processes)) {
        flagCfg = c; restart();
        $("flagSrc").textContent = "Loaded from the site (" + c.processes.length + " processes)";
      }
    })
    .catch(function () { $("flagSrc").textContent = "Not loaded – flags are shown as #position"; });

  fetch(DATA_DIR + STEPS_FILE, { cache: "no-cache" })
    .then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.text(); })
    .then(function (t) { loadSteps(t, STEPS_FILE + " on the site", null); })
    .catch(function (e) {
      $src.textContent = STEPS_FILE + " not found yet (" + e.message + ") – paste your EDOPROCSETFLAG rows below";
      $("upd").open = true;
    });
}
