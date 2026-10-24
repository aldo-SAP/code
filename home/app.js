// To add a page: give it its own folder (index.html, style.css, app.js) and add it to a group below.
var ICONS = {
  edoc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  check: '<path d="M9 11l3 3 7-7"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  xml: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m10 12-2 2 2 2M14 12l2 2-2 2"/>',
  flow: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 6H13a3 3 0 0 1 3 3v.5M15.5 12H11a3 3 0 0 0-3 3v.5"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h5M8 15h8"/>',
  tree: '<path d="M6 4v16M6 8h6M6 14h6"/><rect x="12" y="5" width="7" height="6" rx="1.5"/><rect x="12" y="11.5" width="7" height="5" rx="1.5"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
  menu: '<path d="M7 3v8a2 2 0 0 0 2 2v8M7 3v6M11 3v6M9 3v6"/><path d="M17 3c-2 2-2.5 5-2.500 8H17v10"/>',
  merge: '<rect x="3" y="3" width="9" height="12" rx="1.5"/><rect x="12" y="9" width="9" height="12" rx="1.5"/>'
};
var GROUPS = [
  { name: "eDocument", desc: "Electronic invoicing: statuses and UBL documents", color: "teal", icon: "edoc", tools: [
    { name: "eDocument XML Viewer", href: "edocument-xml/index.html", icon: "xml",
      desc: "Read a UBL invoice or credit note like a paper invoice, check it against the EN 16931 rules and preview the attachments.",
      tags: ["UBL", "EN 16931", "Attachments"] },
    { name: "eDocument Status Checker", href: "edoc-status-checker/index.html", icon: "check",
      desc: "Check an eDocument status string against the configured flag rules.",
      tags: ["Status flags", "Config JSON"] },
    { name: "eDocument Flow Tester", href: "edoc-flow-tester/index.html", icon: "flow",
      desc: "Replay EDOPROCSETFLAG process steps one after another and watch the status string change.",
      tags: ["Process steps", "Status flags", "Config JSON"] }
  ] },
  { name: "SAPscript", desc: "Forms and print programs", color: "amber", icon: "form", tools: [
    { name: "SAPscript Explorer", href: "sapscript/index.html", icon: "tree",
      desc: "Paste a SAPscript export and browse it as a tree or code, with IF/CASE blocks nested.",
      tags: ["Tree view", "Validation"] }
  ] },
  { name: "Utilities", desc: "Small converters", color: "green", icon: "tool", tools: [
    { name: "Base64 to PDF", href: "base64-to-pdf/index.html", icon: "pdf",
      desc: "Decode a Base64 string, preview the PDF and download it.",
      tags: ["Base64", "PDF"] },
    { name: "PDF Merger", href: "pdf-merger/index.html", icon: "merge",
      desc: "Combine PDFs and photos into one PDF, in the order you choose.",
      tags: ["PDF", "Photos", "Merge"] },
    { name: "Menu Reader", href: "menu-reader/index.html", icon: "menu",
      desc: "Photograph a restaurant menu and get it back as cards with a picture per dish, filterable by section, price and diet.",
      tags: ["Menu", "OCR", "Photos", "Filters"] }
  ] }
];

var groupsEl = document.getElementById("groups"), empty = document.getElementById("empty"), search = document.getElementById("search");
var svg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + "</svg>"; };
var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
function hl(text, q) {
  if (!q) return esc(text);
  var i = text.toLowerCase().indexOf(q);
  return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
}

var total = GROUPS.reduce(function (n, g) { return n + g.tools.length; }, 0);
document.getElementById("summary").innerHTML = "<b>" + total + " tools</b> in " + GROUPS.length + " groups";

function render(q) {
  q = q.trim().toLowerCase();
  var shown = 0, html = "";
  GROUPS.forEach(function (g) {
    var groupHit = q && g.name.toLowerCase().indexOf(q) >= 0;
    var items = g.tools.filter(function (t) {
      return !q || groupHit || (t.name + " " + t.desc + " " + t.tags.join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) return;
    shown += items.length;
    html += '<section class="group c-' + g.color + '"><div class="ghead"><div class="gicon">' + svg(g.icon) + "</div>" +
      '<div><h2 class="gtitle">' + hl(g.name, q) + '</h2><div class="gdesc">' + esc(g.desc) + "</div></div>" +
      '<span class="gcount">' + items.length + (items.length === 1 ? " tool" : " tools") + "</span></div><ul class=\"tools\">" +
      items.map(function (t) {
        return '<li><a class="tool" href="' + esc(t.href) + '"><div class="ticon">' + svg(t.icon) + '</div><div class="tbody">' +
          '<span class="tname">' + hl(t.name, q) + '</span><span class="tdesc">' + hl(t.desc, q) + "</span>" +
          '<span class="tags">' + t.tags.map(function (x) { return '<span class="tag">' + hl(x, q) + "</span>"; }).join("") + "</span></div>" +
          '<span class="go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></a></li>';
      }).join("") + "</ul></section>";
  });
  groupsEl.innerHTML = html;
  empty.hidden = shown > 0;
  document.getElementById("q").textContent = q;
}

search.addEventListener("input", function () { render(this.value); });
search.addEventListener("keydown", function (e) {
  if (e.key === "Enter") { var a = groupsEl.querySelector("a.tool"); if (a) location.href = a.href; }
  if (e.key === "Escape") { this.value = ""; render(""); }
});
document.addEventListener("keydown", function (e) {
  if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
});
render("");
