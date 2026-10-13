/* eDocument Flow Tester – Route coverage: everything the tables allow, compared with your allowed routes. */
"use strict";

/* ---------- route coverage ---------- */

// SAP only looks at the status string, so the tables form a graph: status --step--> status.
// The routes say which moves are wanted ("in status X, step S is allowed"); every other
// move the tables allow from a wanted status is a leak. Lines "always, STEP, ..." name steps that
// may run anywhere.

var MAX_STATES = 5000;

function stepToken(s) { return s.step + (s.variant ? " " + s.variant : ""); }

function applyPattern(state, pat) {
  var next = state.slice(), k;
  for (k = 0; k < pat.length && k < next.length; k++) {
    if (pat.charAt(k) === "+") { next[k] = true; }
    else if (pat.charAt(k) === "-") { next[k] = false; }
  }
  return next;
}

// "always" lines: a step without variant covers all its variants
function alwaysTest(cases) {
  var list = [];
  cases.forEach(function (tc) { if (tc.kind === "always") { list = list.concat(tc.steps); } });
  return function (s) {
    return list.some(function (a) {
      return a.step.toUpperCase() === s.step.toUpperCase() && (!a.variant || a.variant.toUpperCase() === s.variant.toUpperCase());
    });
  };
}

// The wanted moves and end statuses, taken from the routes (as far as they pass).
function routeSpec(cases) {
  var allowed = {}, ends = {}, L = statusLength();
  cases.forEach(function (tc) {
    if (tc.invalid || tc.kind !== "route") { return; }
    var state = [], i;
    while (state.length < L) { state.push(false); }
    for (i = 0; i < tc.steps.length; i++) {
      var st = findStep(tc.steps[i].step, tc.steps[i].variant), ev = st ? evalCheck(st, state) : null;
      if (!ev || ev.state !== "pass") { return; }
      allowed[toStr(state) + "|" + stepToken(st)] = true;
      var set = effectOf(st, ev.row);
      state = applyPattern(state, set ? set.pattern : "");
    }
    ends[toStr(state)] = true;
  });
  return { allowed: allowed, ends: ends };
}

// Every status reachable from the empty status, with the moves the tables allow out of it.
function exploreStates() {
  var L = statusLength(), start = [], actions = procSteps(), states = {}, order = [], usedChk = {}, usedSet = {}, q = 0;
  while (start.length < L) { start.push(false); }
  states[toStr(start)] = { state: start, edges: [] };
  order.push(toStr(start));
  while (q < order.length && order.length < MAX_STATES) {
    var key = order[q++], node = states[key];
    actions.forEach(function (a) {
      var ev = evalCheck(a, node.state);
      if (ev.state !== "pass") { return; }
      var set = effectOf(a, ev.row), next = applyPattern(node.state, set ? set.pattern : ""), nk = toStr(next);
      usedChk[[ev.row.step, ev.row.variant, ev.row.seq].join("|")] = true;
      if (set) { usedSet[set.step + "|" + set.variant] = true; }
      node.edges.push({ step: a, row: ev.row, to: nk });
      if (!states[nk]) { states[nk] = { state: next, edges: [] }; order.push(nk); }
    });
  }
  return { states: states, order: order, truncated: q < order.length, usedChk: usedChk, usedSet: usedSet };
}

function coverage(cases) {
  var spec = routeSpec(cases), always = alwaysTest(cases), ignoreNoop = $("ignoreNoop").checked;
  var g = exploreStates(), start = g.order[0];
  var ok = function (from, e) {
    return spec.allowed[from + "|" + stepToken(e.step)] || always(e.step) || (ignoreNoop && e.to === from);
  };
  // wanted statuses: reachable from the start through wanted moves only (shortest route first)
  var path = {}, q = [start], leaks = [], dead = [];
  path[start] = [];
  while (q.length) {
    var from = q.shift();
    g.states[from].edges.forEach(function (e) {
      if (!ok(from, e)) { return; }
      if (path[e.to] === undefined) { path[e.to] = path[from].concat([e.step]); q.push(e.to); }
    });
  }
  Object.keys(path).forEach(function (from) {
    var moves = 0;
    g.states[from].edges.forEach(function (e) {
      if (e.to !== from) { moves++; }
      if (!ok(from, e)) { leaks.push({ path: path[from].concat([e.step]), from: from, to: e.to, row: e.row }); }
    });
    if (!moves && !spec.ends[from] && from !== start) { dead.push({ path: path[from], at: from }); }
  });
  leaks.sort(function (a, b) { return a.path.length - b.path.length; });
  dead.sort(function (a, b) { return a.path.length - b.path.length; });
  var unused = [];
  checks.filter(mine).sort(bySeq).forEach(function (c) {
    if (!g.usedChk[[c.step, c.variant, c.seq].join("|")]) {
      unused.push({ table: "EDOPROCCHKFLAG", row: stepLabel(c) + " / " + c.seq, note: "never the matching sequence in any reachable status" });
    }
  });
  steps.filter(mine).forEach(function (s) {
    if (!g.usedSet[s.step + "|" + s.variant]) {
      unused.push({ table: "EDOPROCSETFLAG", row: s.step + " / " + (s.variant || "(blank)"), note: "never applied – no reachable check sequence picks this method variant" });
    }
  });
  var beyond = g.order.filter(function (k) { return path[k] === undefined; }).length;
  return { leaks: leaks, dead: dead, unused: unused, wanted: Object.keys(path).length, total: g.order.length,
           beyond: beyond, truncated: g.truncated };
}

/* ---------- rendering ---------- */

var covLeaks = [], covDead = [];

function routeText(p) { return p.map(stepToken).join(", "); }

function renderCoverage(cases) {
  var $sum = $("covSum"), $out = $("covOut");
  if (!procKey) { $sum.hidden = true; $out.innerHTML = ""; return; }
  var hasRoutes = cases.some(function (tc) { return tc.kind === "route" && !tc.invalid; });
  if (!hasRoutes) {
    $sum.hidden = false; $sum.className = "tc-sum idle";
    $sum.textContent = "Add routes to check what else the tables allow.";
    $out.innerHTML = ""; return;
  }
  var r = coverage(cases), html = "", LIMIT = 50;
  covLeaks = r.leaks; covDead = r.dead;
  $sum.hidden = false;
  if (!r.leaks.length && !r.dead.length) {
    $sum.className = "tc-sum ok";
    $sum.textContent = "NO LEAKS – the tables allow exactly your routes (" + r.wanted + " statuses checked)";
  } else {
    $sum.className = "tc-sum bad";
    $sum.textContent = r.leaks.length + " leak" + (r.leaks.length === 1 ? "" : "s") + " (moves the tables allow but no route uses), " +
      r.dead.length + " dead end" + (r.dead.length === 1 ? "" : "s");
  }
  var info = r.wanted + " statuses reachable through your routes, " + r.total + " reachable in total";
  if (r.beyond) { info += " (" + r.beyond + " only through a leak)"; }
  if (r.truncated) { info += " – stopped after " + MAX_STATES + " statuses"; }
  html += '<p class="hint">' + esc(info) + ".</p>";

  if (r.leaks.length) {
    html += "<h3>Leaks</h3>" + '<div class="wrap"><table><thead><tr><th>#</th><th>Route that should not be possible</th>' +
      "<th>Status before → after</th><th>Sequence</th><th></th></tr></thead><tbody>" +
      r.leaks.slice(0, LIMIT).map(function (l, i) {
        var before = l.path.slice(0, -1), last = l.path[l.path.length - 1];
        return '<tr><td class="pos">' + (i + 1) + '</td><td class="tcline">' + (before.length ? esc(routeText(before)) + ", " : "") +
          "<mark>" + esc(stepToken(last)) + '</mark></td><td class="mono">' + l.from + "<br>" + l.to + '</td><td class="mono">' +
          l.row.seq + (l.row.method ? " → " + esc(l.row.method) : "") + '</td><td class="acts">' +
          '<button type="button" class="small" data-leak="' + i + '" data-act="replay">Replay</button> ' +
          '<button type="button" class="small" data-leak="' + i + '" data-act="allow" title="Adds this route to your allowed routes">Allow</button></td></tr>';
      }).join("") + "</tbody></table></div>" +
      (r.leaks.length > LIMIT ? '<p class="hint">… and ' + (r.leaks.length - LIMIT) + " more. Fix or allow the first ones and run again.</p>" : "");
  }
  if (r.dead.length) {
    html += "<h3>Dead ends</h3>" + '<p class="hint">Statuses your routes reach where no step can change the status any more, and no route ends there.</p>' +
      '<div class="wrap"><table><thead><tr><th>#</th><th>Route</th><th>Status</th><th></th></tr></thead><tbody>' +
      r.dead.slice(0, LIMIT).map(function (d, i) {
        return '<tr><td class="pos">' + (i + 1) + '</td><td class="tcline">' + esc(routeText(d.path)) + '</td><td class="mono">' + d.at +
          '</td><td><button type="button" class="small" data-dead="' + i + '">Replay</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }
  if (r.unused.length) {
    html += "<h3>Never used</h3>" + '<p class="hint">Rows that play no part in any reachable status – often a typo in a pattern, or a step whose routes are missing.</p>' +
      '<div class="wrap"><table><thead><tr><th>Table</th><th>Row</th><th>Why</th></tr></thead><tbody>' +
      r.unused.map(function (u) {
        return "<tr><td>" + u.table + '</td><td class="mono">' + esc(u.row) + '</td><td class="hint">' + esc(u.note) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  $out.innerHTML = html;
}

function pathCase(p) { return { steps: p.map(function (s) { return { step: s.step, variant: s.variant }; }) }; }
