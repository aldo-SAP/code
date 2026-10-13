(function () {
  "use strict";

  var EMPTY_CHARS = "oO0_-. ";
  var RULE_CHAR = { O: "o", M: "+", E: "-" };

  var config = null;     // working configuration
  var baseline = null;   // copy as loaded (for "Reset rules")
  var cur = 0;           // index of the selected process/version

  function $(id) { return document.getElementById(id); }
  var $input = $("input"), $rows = $("rows"), $strip = $("strip"), $verdict = $("verdict"),
      $len = $("len"), $rulesIn = $("rulesIn"), $rulesNote = $("rulesNote"),
      $pin = $("procIn"), $plist = $("procList"), $src = $("cfgSrc"), $msg = $("applyMsg");

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function proc() { return config.processes[cur]; }

  /* ---------- configuration handling ---------- */

  function normalize(obj) {
    if (!obj || !Array.isArray(obj.processes) || obj.processes.length === 0) {
      throw new Error("JSON must contain a non-empty \"processes\" array.");
    }
    var out = { schemaVersion: 1, processes: [] };
    obj.processes.forEach(function (p) {
      if (!p || !p.process || !Array.isArray(p.flags)) { throw new Error("Each process needs \"process\" and \"flags\"."); }
      var flags = [];
      p.flags.forEach(function (f) {
        var pos = parseInt(f.pos, 10);
        var name = String(f.flag || "").trim();
        if (!(pos > 0) || !name) { return; }
        var rule = (f.rule === "M" || f.rule === "E") ? f.rule : "O";
        flags.push({ pos: pos, flag: name, description: String(f.description || ""), rule: rule });
      });
      flags.sort(function (a, b) { return a.pos - b.pos; });
      out.processes.push({ process: String(p.process), procVersion: String(p.procVersion || ""), flags: flags });
    });
    return out;
  }

  function setConfig(c, sourceText) {
    config = c;
    baseline = clone(c);
    cur = 0;
    $src.textContent = sourceText;
    refresh();
  }

  /* ---------- process / version search box ---------- */

  var listOpen = false, active = -1, shown = [];

  function plabel(p) { return p.process + " / " + p.procVersion; }

  function renderSelector() { $pin.value = plabel(proc()); }

  function setActive(k, scroll) {
    var items = $plist.querySelectorAll('li[role="option"]'), i;
    active = k;
    for (i = 0; i < items.length; i++) { items[i].className = items[i].className.replace(/\bact\b/, "").trim(); }
    if (items[k]) {
      items[k].className = (items[k].className + " act").trim();
      if (scroll && items[k].scrollIntoView) { items[k].scrollIntoView({ block: "nearest" }); }
    }
  }

  function renderList(filter) {
    var tokens = filter.toLowerCase().split(/[\s\/]+/).filter(Boolean);
    shown = [];
    config.processes.forEach(function (p, i) {
      var hay = (p.process + " " + p.procVersion).toLowerCase();
      if (tokens.every(function (t) { return hay.indexOf(t) !== -1; })) { shown.push(i); }
    });
    var html = '<li class="hint">' + shown.length + " of " + config.processes.length + " shown</li>";
    shown.forEach(function (i, k) {
      var p = config.processes[i];
      html += '<li role="option" data-k="' + k + '"' + (i === cur ? ' class="cur"' : "") + ">" +
        esc(plabel(p)) + "<small>" + p.flags.length + " flags</small></li>";
    });
    if (!shown.length) { html += '<li class="hint">No match</li>'; }
    $plist.innerHTML = html;
    var curK = shown.indexOf(cur);
    setActive(!tokens.length && curK !== -1 ? curK : (shown.length ? 0 : -1), true);
  }

  function openList(filter) {
    listOpen = true;
    $plist.hidden = false;
    $pin.setAttribute("aria-expanded", "true");
    renderList(filter);
  }

  function closeList() {
    listOpen = false;
    $plist.hidden = true;
    $pin.setAttribute("aria-expanded", "false");
    $pin.value = plabel(proc());
  }

  function choose(k) {
    if (k < 0 || k >= shown.length) { return; }
    cur = shown[k];
    closeList();
    refresh();
  }

  /* ---------- rules table ---------- */

  function buildTable() {
    var html = "";
    proc().flags.forEach(function (f, i) {
      html += '<tr id="row' + i + '">' +
        '<td class="pos">' + f.pos + '</td>' +
        '<td class="name">' + esc(f.flag) + '</td>' +
        '<td>' + (f.description ? esc(f.description) : '<span style="color:var(--muted)">—</span>') + '</td>';
      ["O", "M", "E"].forEach(function (mode) {
        html += '<td class="rb"><input type="radio" name="rule' + i + '" value="' + mode + '"' +
                (f.rule === mode ? " checked" : "") +
                ' aria-label="' + esc(f.flag) + ' ' + mode + '" data-idx="' + i + '"></td>';
      });
      html += '<td class="val" id="val' + i + '"></td><td class="res" id="res' + i + '"></td></tr>';
    });
    $rows.innerHTML = html;
  }

  function syncRadios() {
    proc().flags.forEach(function (f, i) {
      var r = document.querySelector('input[name="rule' + i + '"][value="' + f.rule + '"]');
      if (r) { r.checked = true; }
    });
  }

  function maxPos() {
    var m = 0;
    proc().flags.forEach(function (f) { if (f.pos > m) { m = f.pos; } });
    return m;
  }

  function syncRuleString() {
    var m = maxPos(), arr = [], i;
    for (i = 0; i < m; i++) { arr.push("o"); }
    proc().flags.forEach(function (f) { arr[f.pos - 1] = RULE_CHAR[f.rule]; });
    $rulesIn.value = arr.join("");
    $rulesNote.textContent = "";
  }

  function applyRuleString() {
    var s = $rulesIn.value, bad = [];
    proc().flags.forEach(function (f) {
      var c = s.charAt(f.pos - 1);
      if (c === "") { return; }
      if (c === "+") { f.rule = "M"; }
      else if (c === "-") { f.rule = "E"; }
      else if (c === "o" || c === "O") { f.rule = "O"; }
      else { bad.push(f.pos); }
    });
    syncRadios();
    evaluate();
    var notes = [];
    if (s.length < maxPos()) { notes.push("shorter than " + maxPos() + " – remaining flags keep their current rule"); }
    if (bad.length) { notes.push("invalid character at position " + bad.join(", ") + " – rule unchanged there"); }
    $rulesNote.textContent = notes.join("; ");
  }

  /* ---------- evaluation ---------- */

  function classify(ch) {
    if (ch === undefined) { return "missing"; }
    if (ch === "X" || ch === "x") { return "set"; }
    if (EMPTY_CHARS.indexOf(ch) !== -1) { return "empty"; }
    return "invalid";
  }

  function evaluate() {
    var s = $input.value.replace(/[\r\n]/g, "");
    var flags = proc().flags;
    var failures = [], warnings = [], stripHtml = "";

    $len.textContent = "Length: " + s.length + " · " + flags.length + " flags defined (positions 1–" + maxPos() + ")";

    flags.forEach(function (f, i) {
      var ch = s.charAt(f.pos - 1) === "" ? undefined : s.charAt(f.pos - 1);
      var kind = classify(ch);
      var status;

      if (f.rule === "O") { status = "skip"; }
      else if (f.rule === "M") { status = kind === "set" ? "pass" : "fail"; }
      else { status = kind === "set" ? "fail" : "pass"; }

      if (kind === "invalid") {
        warnings.push("Position " + f.pos + ": unexpected character “" + ch + "” (treated as not set)");
      }
      if (status === "fail") {
        failures.push("#" + f.pos + " " + f.flag + " – " +
          (f.rule === "M" ? "mandatory but not set" : "must be empty but is set"));
      }

      var shown = kind === "missing" ? "–" : esc(ch === " " ? "␣" : ch);
      document.getElementById("row" + i).className = status === "fail" ? "fail" : "";
      document.getElementById("val" + i).innerHTML = shown;
      document.getElementById("res" + i).innerHTML =
        '<span class="badge ' + status + '">' +
        (status === "pass" ? "OK" : status === "fail" ? "FAILED" : "not checked") + '</span>';

      stripHtml += '<div class="cell ' + (status === "skip" ? "" : status) + '" title="' +
        esc(f.flag) + '">' + shown + '<small>' + f.pos + '</small></div>';
    });

    if (s.length > 0 && s.length < maxPos()) {
      warnings.push("The string is shorter than " + maxPos() + " characters; missing positions count as not set.");
    }

    $strip.innerHTML = stripHtml;
    renderVerdict(s, failures, warnings);
  }

  function renderVerdict(s, failures, warnings) {
    var html, cls;
    if (s.length === 0) {
      cls = "verdict idle";
      html = '<span class="icon">ℹ</span><div>Enter a status string to check it.</div>';
    } else if (failures.length === 0) {
      cls = "verdict ok";
      html = '<span class="icon">✔</span><div>PASSED – all mandatory flags are set and all "empty" flags are clear.';
    } else {
      cls = "verdict bad";
      html = '<span class="icon">✖</span><div>FAILED – ' + failures.length + ' rule' +
        (failures.length > 1 ? "s" : "") + ' not satisfied:<ul>' +
        failures.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>";
    }
    if (s.length > 0 && warnings.length) {
      html += '<ul>' + warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>";
    }
    if (s.length > 0) { html += "</div>"; }
    $verdict.className = cls;
    $verdict.innerHTML = html;
  }

  function refresh() {
    renderSelector();
    buildTable();
    syncRuleString();
    evaluate();
  }

  /* ---------- pasted SAP tables ---------- */

  function splitLine(line) {
    line = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");     // tolerate list-style borders
    if (line.indexOf("\t") !== -1) {
      return line.split("\t").map(function (c) { return c.trim(); });
    }
    return line.trim().split(/\s+/);
  }

  function parseAssignments(text) {
    var rows = [], skipped = 0;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) { return; }
      var c = splitLine(line);
      if (c[0] && c[0].toUpperCase() === "PROCESS") { return; }   // header row
      var pos = parseInt(c[2], 10);
      if (c.length < 4 || !c[0] || !(pos > 0) || !c[3]) { skipped++; return; }
      rows.push({ process: c[0], procVersion: c[1], pos: pos, flag: c[3] });
    });
    return { rows: rows, skipped: skipped };
  }

  function parseDescriptions(text) {
    var map = {}, count = 0, skipped = 0;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) { return; }
      var c = splitLine(line);
      if (c.length < 3 || !c[0] || !c[1]) { skipped++; return; }
      if (c[0].toUpperCase() === "PROCESS") { return; }          // header row
      map[c[0] + "|" + c[1]] = c.slice(2).join(" ").trim();
      count++;
    });
    return { map: map, count: count, skipped: skipped };
  }

  function findRule(process, procVersion, flag) {
    var i, j, p, f, fallback = null;
    for (i = 0; i < config.processes.length; i++) {
      p = config.processes[i];
      if (p.process !== process) { continue; }
      for (j = 0; j < p.flags.length; j++) {
        f = p.flags[j];
        if (f.flag === flag) {
          if (p.procVersion === procVersion) { return f.rule; }
          if (fallback === null) { fallback = f.rule; }
        }
      }
    }
    return fallback;
  }

  function addMsg(list, cls, text) { list.push('<div class="m ' + cls + '">' + text + "</div>"); }

  function applyPasted() {
    var asg = parseAssignments($("pasteAsg").value);
    var txt = parseDescriptions($("pasteTxt").value);
    var out = [];

    if (asg.rows.length === 0 && txt.count === 0) {
      addMsg(out, "err", "Nothing to apply – paste at least one of the two tables.");
      $msg.innerHTML = out.join("");
      return;
    }

    var selected = proc().process + "|" + proc().procVersion;

    if (asg.rows.length > 0) {
      // group by process + version
      var groups = {}, order = [];
      asg.rows.forEach(function (r) {
        var k = r.process + "|" + r.procVersion;
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(r);
      });

      var used = {};
      order.forEach(function (k) {
        var rows = groups[k], first = rows[0], flags = [], missingDesc = [], seenPos = {}, dupPos = [];
        rows.sort(function (a, b) { return a.pos - b.pos; });
        rows.forEach(function (r) {
          if (seenPos[r.pos]) { dupPos.push(r.pos); return; }
          seenPos[r.pos] = true;
          var d = txt.map[r.process + "|" + r.flag];
          if (d === undefined) {
            // keep an existing description if the text table was not pasted / lacks the flag
            d = "";
            config.processes.forEach(function (p) {
              if (p.process === r.process) { p.flags.forEach(function (f) { if (f.flag === r.flag && f.description) { d = f.description; } }); }
            });
            if (!d) { missingDesc.push(r.flag); }
          } else { used[r.process + "|" + r.flag] = true; }
          var rule = findRule(r.process, r.procVersion, r.flag);
          flags.push({ pos: r.pos, flag: r.flag, description: d, rule: rule === null ? "O" : rule });
        });

        var entry = { process: first.process, procVersion: first.procVersion, flags: flags };
        var idx = -1;
        config.processes.forEach(function (p, i) {
          if (p.process === entry.process && p.procVersion === entry.procVersion) { idx = i; }
        });
        if (idx === -1) { config.processes.push(entry); } else { config.processes[idx] = entry; }

        addMsg(out, "ok", "<b>" + esc(entry.process) + " / " + esc(entry.procVersion) + "</b>: " +
          flags.length + " flags loaded" + (idx === -1 ? " (new)" : " (replaced)") + ".");
        if (missingDesc.length) {
          addMsg(out, "warn", "No description found for: " + esc(missingDesc.join(", ")) + ".");
        }
        if (dupPos.length) {
          addMsg(out, "warn", "Duplicate position(s) ignored: " + esc(dupPos.join(", ")) + ".");
        }
      });

      if (txt.count > 0) {
        var unused = Object.keys(txt.map).filter(function (k) { return !used[k]; });
        if (unused.length) {
          addMsg(out, "warn", unused.length + " description row(s) did not match any assigned flag: " +
            esc(unused.slice(0, 8).map(function (k) { return k.replace("|", " / "); }).join(", ")) +
            (unused.length > 8 ? ", …" : "") + ".");
        }
      }
      if (asg.skipped) { addMsg(out, "warn", asg.skipped + " line(s) of EDOPROCFLAGASG could not be read and were skipped."); }
    } else {
      // only descriptions pasted: update the texts of the existing flags
      var updated = 0;
      config.processes.forEach(function (p) {
        p.flags.forEach(function (f) {
          var d = txt.map[p.process + "|" + f.flag];
          if (d !== undefined) { f.description = d; updated++; }
        });
      });
      addMsg(out, updated ? "ok" : "warn", updated + " flag description(s) updated.");
    }
    if (txt.skipped) { addMsg(out, "warn", txt.skipped + " line(s) of EDOPROCSTAFLAGT could not be read and were skipped."); }

    // keep the previously selected process if it still exists
    var again = -1;
    config.processes.forEach(function (p, i) { if (p.process + "|" + p.procVersion === selected) { again = i; } });
    cur = again === -1 ? 0 : again;

    $src.textContent = "Modified in this page – press Save config JSON to keep it";
    refresh();
    $msg.innerHTML = out.join("");
  }

  /* ---------- JSON download / load ---------- */

  var fileHandle = null;   // set when the file was opened / saved through the browser's file picker
  var JSON_TYPES = [{ description: "JSON", accept: { "application/json": [".json"] } }];

  function configText() { return JSON.stringify(config, null, 2) + "\n"; }

  function downloadCopy() {
    var blob = new Blob([configText()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "edoc_flag_config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // Overwrites the chosen file in place (Chrome / Edge). Other browsers cannot overwrite
  // a file, so they fall back to a normal download.
  async function save() {
    var text = configText();
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({ suggestedName: "edoc_flag_config.json", types: JSON_TYPES });
        }
        var perm = "granted";
        if (fileHandle.queryPermission) { perm = await fileHandle.queryPermission({ mode: "readwrite" }); }
        if (perm !== "granted" && fileHandle.requestPermission) { perm = await fileHandle.requestPermission({ mode: "readwrite" }); }
        if (perm !== "granted") { throw new Error("permission to write the file was denied"); }
        var w = await fileHandle.createWritable();
        await w.write(text);
        await w.close();
        $src.textContent = "Saved to " + fileHandle.name + " at " + now() + " – Save overwrites this file";
        return;
      } catch (e) {
        if (e && e.name === "AbortError") { return; }             // picker cancelled
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

  function loadText(text, name, handle) {
    try {
      var c = normalize(JSON.parse(text));
      fileHandle = handle || null;
      setConfig(c, "Loaded from " + name + (handle ? " – Save overwrites this file" : ""));
      $msg.innerHTML = "";
      return true;
    } catch (e) {
      $msg.innerHTML = '<div class="m err">Could not load ' + esc(name) + ": " + esc(e.message) + "</div>";
      $("upd").open = true;
      return false;
    }
  }

  async function openFile() {
    if (window.showOpenFilePicker) {
      try {
        var hs = await window.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
        var f = await hs[0].getFile();
        loadText(await f.text(), f.name, hs[0]);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") { return; }
        // any other problem (e.g. blocked inside an embedded view): use the classic file input
      }
    }
    $("ldFile").click();
  }

  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () { loadText(reader.result, file.name, null); };
    reader.readAsText(file);
  }

  /* ---------- events ---------- */

  $rows.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.type === "radio") {
      proc().flags[Number(t.getAttribute("data-idx"))].rule = t.value;
      syncRuleString();
      evaluate();
    }
  });
  $rulesIn.addEventListener("input", applyRuleString);
  $input.addEventListener("input", evaluate);
  $pin.addEventListener("focus", function () { $pin.select(); openList(""); });
  $pin.addEventListener("input", function () { openList($pin.value); });
  $pin.addEventListener("blur", closeList);
  $pin.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!listOpen) { openList(""); } else { setActive(Math.min(active + 1, shown.length - 1), true); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (listOpen) { setActive(Math.max(active - 1, 0), true); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (listOpen) { choose(active); }
    } else if (e.key === "Escape") {
      closeList();
      $pin.select();
    }
  });
  // mousedown (not click) so the input keeps focus and blur does not close the list first
  $plist.addEventListener("mousedown", function (e) {
    e.preventDefault();
    var li = e.target.closest ? e.target.closest('li[role="option"]') : null;
    if (li) { choose(Number(li.getAttribute("data-k"))); }
  });
  $("procToggle").addEventListener("mousedown", function (e) {
    e.preventDefault();
    if (listOpen) { closeList(); } else { $pin.focus(); openList(""); }
  });

  $("reset").addEventListener("click", function () {
    var p = proc();
    baseline.processes.forEach(function (b) {
      if (b.process === p.process && b.procVersion === p.procVersion) {
        p.flags.forEach(function (f) {
          b.flags.forEach(function (bf) { if (bf.flag === f.flag) { f.rule = bf.rule; } });
        });
      }
    });
    syncRadios(); syncRuleString(); evaluate();
  });
  $("allopt").addEventListener("click", function () {
    proc().flags.forEach(function (f) { f.rule = "O"; });
    syncRadios(); syncRuleString(); evaluate();
  });
  $("apply").addEventListener("click", applyPasted);
  $("clearPaste").addEventListener("click", function () {
    $("pasteAsg").value = ""; $("pasteTxt").value = ""; $msg.innerHTML = "";
  });
  $("dl").addEventListener("click", save);
  $("ldBtn").addEventListener("click", openFile);
  $("ldFile").addEventListener("change", function () {
    if (this.files && this.files[0]) { loadFile(this.files[0]); }
    this.value = "";
  });

  /* ---------- start ---------- */

  function useStarter(why) {
    try {
      setConfig(normalize(JSON.parse($("starter").textContent)),
        "Built-in starter configuration" + (why ? " (" + why + ")" : ""));
    } catch (e) {
      $src.textContent = "Starter configuration is invalid: " + e.message;
      config = { schemaVersion: 1, processes: [{ process: "-", procVersion: "-", flags: [] }] };
      baseline = clone(config);
      refresh();
    }
  }

  // Load the shared data/edoc_flag_config.json (the file in GitHub);
  // fall back to the built-in starter if it cannot be fetched (e.g. page opened from disk).
  useStarter("loading edoc_flag_config.json…");
  if (window.fetch) {
    fetch("../data/edoc_flag_config.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.text(); })
      .then(function (t) {
        setConfig(normalize(JSON.parse(t)), "Loaded from edoc_flag_config.json on the site");
      })
      .catch(function (e) { useStarter("edoc_flag_config.json not available: " + e.message); });
  }
})();
