// Menu Reader: photo -> text (Tesseract.js on this device, or Claude) -> dishes -> a picture per dish -> filterable cards.
var TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
var CLAUDE_MODEL = "claude-sonnet-5-5";
var DIETS = [["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["spicy", "Spicy"], ["gluten-free", "Gluten-free"]];
var KEYS = ["claudeKey", "gKey", "gCx"];

var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
var state = { file: null, items: [], sections: [], section: "", diets: {}, max: 0, priceCeil: 0 };

/* ---------- reading the text ---------- */
var PRICE_END = /(?:(?:[$€£]\s?\d{1,4}(?:[.,]\d{1,2})?)|(?:\d{1,4}[.,]\d{2}\s?(?:[$€£]|eur|usd|gbp)?)|(?:\d{1,4}\s?[$€£]))\s*$/i;
var PRICE_BARE = /\s\.{0,}\s*(\d{1,3})\s*$/;

function tagsFromText(t) {
  var tags = [];
  if (/\bvegan\b|\(ve\)/i.test(t)) tags.push("vegan", "vegetarian");
  else if (/\bveg(etarian|gie)?\b|\(v\)|vegetariano|végétarien/i.test(t)) tags.push("vegetarian");
  if (/\bspicy\b|🌶|\bpiccante\b|\bépicé\b|\bchil+i\b/i.test(t)) tags.push("spicy");
  if (/gluten[- ]?free|\(gf\)|senza glutine|sans gluten/i.test(t)) tags.push("gluten-free");
  return tags;
}

function parsePrice(s) {
  var m = /(\d{1,4})(?:[.,](\d{1,2}))?/.exec(s);
  return m ? parseFloat(m[1] + "." + (m[2] || "0")) : null;
}

// Turns raw OCR text into [{section, name, price, priceText, description, search, tags}].
function parseMenuText(text) {
  var lines = text.split(/\r?\n/).map(function (l) {
    return l.replace(/[|_~\\]+/g, " ").replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim();
  }).filter(function (l) { return (l.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3; });
  var items = [], section = "", last = null;
  lines.forEach(function (line) {
    var priceText = "", m = PRICE_END.exec(line);
    if (m) { priceText = m[0].trim(); line = line.slice(0, m.index).trim(); }
    else if ((m = PRICE_BARE.exec(line)) && line.split(" ").length > 2) { priceText = m[1]; line = line.slice(0, m.index).trim(); }
    if (!line) return;
    var letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    var isCaps = letters.length >= 3 && letters === letters.toUpperCase();
    if (!priceText && isCaps && line.split(" ").length <= 4) { section = line.charAt(0) + line.slice(1).toLowerCase(); last = null; return; }
    if (!priceText && last && !last.description && (/^[a-zà-ÿ(]/.test(line) || line.length > 45)) { last.description = line; return; }
    var name = line, desc = "", cut = /\s[-–—]\s|:|,/.exec(line);
    if (cut && cut.index >= 3) { name = line.slice(0, cut.index); desc = line.slice(cut.index + cut[0].length).trim(); }
    last = { section: section, name: name.replace(/^[\d.\-•*\s]+/, "").trim(), price: priceText ? parsePrice(priceText) : null,
      priceText: priceText, description: desc, search: "", tags: [] };
    if (last.name.length >= 2) items.push(last);
  });
  items.forEach(function (it) { it.tags = tagsFromText(it.name + " " + it.description); });
  return items;
}

function loadScript(src) {
  return new Promise(function (ok, fail) {
    var s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = function () { fail(new Error("Could not load the text reader. Check your connection.")); };
    document.head.appendChild(s);
  });
}

// Downscale to keep uploads small and OCR quick; createImageBitmap honours the photo's rotation.
function toCanvas(file, maxSide) {
  return createImageBitmap(file).then(function (bmp) {
    var k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  });
}

function readWithOcr(file, lang) {
  setStatus("Loading the text reader…", false, 0);
  return Promise.all([window.Tesseract ? 0 : loadScript(TESSERACT_URL), toCanvas(file, 2200)]).then(function (r) {
    return window.Tesseract.recognize(r[1], lang, { logger: function (m) {
      if (m.status === "recognizing text") setStatus("Reading the menu… " + Math.round(m.progress * 100) + "%", false, m.progress);
      else setStatus("Preparing: " + m.status + "…", false, 0);
    } });
  }).then(function (res) { return { text: res.data.text }; });
}

function readWithClaude(file, key) {
  setStatus("Asking Claude to read the menu…", false, -1);
  return toCanvas(file, 1800).then(function (c) {
    var b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 4096, messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: 'This is a photo of a restaurant menu. List every dish. Reply with JSON only, no other text: {"items":[{"section":"","name":"","price":0,"priceText":"","description":"","search":"","tags":[]}]}. ' +
          'Keep name, section and description in the menu\'s language. price is a number or null; priceText is the price as printed. search is a short English phrase for a photo search of the dish. ' +
          'tags may contain only: "vegetarian", "vegan", "spicy", "gluten-free"; use them only when the menu says so or the ingredients make it certain.' }
      ] }] })
    });
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error((j.error && j.error.message) || "Claude returned an error (" + r.status + ").");
      return j;
    });
  }).then(function (j) {
    var t = (j.content || []).map(function (b) { return b.text || ""; }).join("");
    var a = t.indexOf("{"), z = t.lastIndexOf("}");
    if (a < 0 || z < a) throw new Error("Claude did not return a menu. Try again.");
    var items = JSON.parse(t.slice(a, z + 1)).items || [];
    return { items: items.filter(function (i) { return i && i.name; }).map(function (i) {
      var p = typeof i.price === "number" ? i.price : parsePrice(String(i.priceText || ""));
      return { section: i.section || "", name: String(i.name), price: p, priceText: i.priceText || (p != null ? String(p) : ""),
        description: i.description || "", search: i.search || "",
        tags: (i.tags || []).filter(function (t) { return DIETS.some(function (d) { return d[0] === t; }); }) };
    }) };
  });
}

/* ---------- pictures ---------- */
function wikiImage(q) {
  var u = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=480&format=json&origin=*&gsrsearch=" + encodeURIComponent(q);
  return fetch(u).then(function (r) { return r.json(); }).then(function (j) {
    var pages = j.query && j.query.pages ? Object.keys(j.query.pages).map(function (k) { return j.query.pages[k]; }) : [];
    pages.sort(function (a, b) { return a.index - b.index; });
    for (var i = 0; i < pages.length; i++) if (pages[i].thumbnail) return pages[i].thumbnail.source;
    return "";
  });
}
function googleImage(q) {
  var u = "https://www.googleapis.com/customsearch/v1?searchType=image&num=1&safe=active&key=" + encodeURIComponent($("gKey").value.trim()) +
    "&cx=" + encodeURIComponent($("gCx").value.trim()) + "&q=" + encodeURIComponent(q);
  return fetch(u).then(function (r) { return r.json(); }).then(function (j) { return j.items && j.items[0] ? j.items[0].link : ""; });
}
function findImage(item) {
  var base = (item.search || item.name).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
  var useGoogle = $("gKey").value.trim() && $("gCx").value.trim();
  var steps = [];
  if (useGoogle) steps.push(function () { return googleImage(base + " dish food"); });
  steps.push(function () { return wikiImage(base); }, function () { return wikiImage(base + " food"); });
  return steps.reduce(function (p, step) {
    return p.then(function (url) { return url || step().catch(function () { return ""; }); });
  }, Promise.resolve(""));
}
function googleLink(item) {
  return "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent((item.search || item.name) + " food");
}

/* ---------- cards and filters ---------- */
function visible() {
  var q = $("q").value.trim().toLowerCase();
  var on = DIETS.filter(function (d) { return state.diets[d[0]]; }).map(function (d) { return d[0]; });
  var list = state.items.filter(function (it) {
    if (state.section && it.section !== state.section) return false;
    if (q && (it.name + " " + it.description + " " + it.section).toLowerCase().indexOf(q) < 0) return false;
    if (on.some(function (t) { return it.tags.indexOf(t) < 0; })) return false;
    if (state.max < state.priceCeil && it.price != null && it.price > state.max) return false;
    if (state.max < state.priceCeil && it.price == null) return false;
    return true;
  });
  var s = $("sort").value;
  if (s !== "menu") list = list.slice().sort(function (a, b) {
    if (s === "name") return a.name.localeCompare(b.name);
    var x = a.price == null ? Infinity : a.price, y = b.price == null ? Infinity : b.price;
    if (x === Infinity && y === Infinity) return 0;
    return s === "priceAsc" ? x - y : (y === Infinity ? -1 : x === Infinity ? 1 : y - x);
  });
  return list;
}

function cardHtml(it) {
  var el = document.createElement("article");
  el.className = "card";
  el.innerHTML = '<div class="pic' + (it.img === undefined ? " loading" : "") + '" aria-hidden="true">' +
    (it.img ? '<img src="' + esc(it.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : esc(it.name.charAt(0).toUpperCase())) + "</div>" +
    '<div class="body"><div class="head"><h3>' + esc(it.name) + "</h3>" + (it.priceText ? '<span class="price">' + esc(it.priceText) + "</span>" : "") + "</div>" +
    (it.description ? '<p class="desc">' + esc(it.description) + "</p>" : "") +
    (it.tags.length ? '<div class="tags">' + it.tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
    '<a class="more" href="' + esc(googleLink(it)) + '" target="_blank" rel="noopener">More photos on Google</a></div>';
  var img = el.querySelector("img");
  if (img) img.onerror = function () { it.img = ""; img.remove(); };
  it.el = el;
  return el;
}

function renderCards() {
  var list = visible(), box = $("cards"), lastSec = null;
  box.textContent = "";
  list.forEach(function (it) {
    if ($("sort").value === "menu" && it.section && it.section !== lastSec) {
      var h = document.createElement("h2"); h.className = "sect"; h.textContent = it.section; box.appendChild(h);
    }
    lastSec = it.section;
    box.appendChild(it.el || cardHtml(it));
  });
  $("count").textContent = list.length + " of " + state.items.length + " dishes";
  $("none").hidden = list.length > 0;
}

function chip(label, pressed, on) {
  var b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", pressed ? "true" : "false");
  b.onclick = on; return b;
}
function renderChips() {
  var s = $("sections"); s.textContent = "";
  if (state.sections.length) {
    s.appendChild(chip("All", !state.section, function () { state.section = ""; renderChips(); renderCards(); }));
    state.sections.forEach(function (n) { s.appendChild(chip(n, state.section === n, function () { state.section = n; renderChips(); renderCards(); })); });
  }
  var d = $("diets"); d.textContent = "";
  DIETS.forEach(function (x) {
    if (!state.items.some(function (it) { return it.tags.indexOf(x[0]) >= 0; })) return;
    d.appendChild(chip(x[1], state.diets[x[0]], function () { state.diets[x[0]] = !state.diets[x[0]]; renderChips(); renderCards(); }));
  });
}

function showMenu(items) {
  state.items = items; state.section = ""; state.diets = {};
  state.sections = items.map(function (i) { return i.section; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
  var prices = items.map(function (i) { return i.price; }).filter(function (p) { return p != null; });
  state.priceCeil = prices.length ? Math.ceil(Math.max.apply(null, prices)) : 0;
  state.max = state.priceCeil;
  var r = $("maxPrice"); r.max = state.priceCeil; r.value = state.max; r.disabled = !state.priceCeil;
  $("maxOut").textContent = state.priceCeil ? "(any)" : "(no prices found)";
  $("q").value = ""; $("sort").value = "menu";
  $("result").hidden = false;
  renderChips(); renderCards();
  fetchImages(items);
}

function fetchImages(items) {
  var queue = items.slice(), running = 0, token = items;
  function next() {
    while (running < 4 && queue.length) {
      (function (it) {
        running++;
        findImage(it).then(function (url) { it.img = url; }).catch(function () { it.img = ""; }).then(function () {
          running--;
          if (token !== state.items) return;
          if (it.el) {
            var old = it.el; old.replaceWith(cardHtml(it));
          }
          next();
        });
      })(queue.shift());
    }
  }
  next();
}

/* ---------- page wiring ---------- */
function setStatus(msg, isErr, progress) {
  var s = $("status"); s.textContent = msg; s.className = "status" + (isErr ? " err" : "");
  var b = $("bar");
  if (progress === undefined) { b.hidden = true; return; }
  b.hidden = false;
  if (progress < 0) b.removeAttribute("value"); else b.value = progress;
}

function chooseFile(f) {
  if (!f || !/^image\//.test(f.type)) { setStatus("That file is not an image.", true); return; }
  state.file = f;
  var p = $("preview"); if (p.src) URL.revokeObjectURL(p.src);
  p.src = URL.createObjectURL(f); p.hidden = false;
  $("go").disabled = false; setStatus("");
}

function finish(res) {
  var items = res.items || parseMenuText(res.text);
  if (res.text !== undefined) { $("raw").value = res.text; $("rawBox").hidden = false; }
  else $("rawBox").hidden = true;
  if (!items.length) { setStatus("No dishes found. Try a sharper, straighter photo, or switch the reading mode.", true); return; }
  setStatus("Found " + items.length + " dishes. Looking for pictures…");
  showMenu(items);
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function run() {
  var mode = $("mode").value, key = $("claudeKey").value.trim();
  if (mode === "claude" && !key) { $("settings").open = true; setStatus("Enter your Claude API key under “Keys and privacy”.", true); return; }
  $("go").disabled = true;
  (mode === "claude" ? readWithClaude(state.file, key) : readWithOcr(state.file, $("lang").value))
    .then(finish).catch(function (e) { setStatus(e.message || String(e), true); })
    .then(function () { $("go").disabled = false; $("bar").hidden = true; });
}

function saveKeys() {
  try {
    KEYS.forEach(function (k) { localStorage.removeItem("menu-reader." + k); });
    if ($("remember").checked) KEYS.forEach(function (k) { localStorage.setItem("menu-reader." + k, $(k).value); });
  } catch (e) { /* storage blocked: keys just last for this visit */ }
}

(function init() {
  try {
    KEYS.forEach(function (k) { var v = localStorage.getItem("menu-reader." + k); if (v) { $(k).value = v; $("remember").checked = true; } });
  } catch (e) { /* ignore */ }
  KEYS.forEach(function (k) { $(k).addEventListener("input", saveKeys); });
  $("remember").addEventListener("change", saveKeys);
  $("picker").addEventListener("change", function (e) { chooseFile(e.target.files[0]); });
  var drop = $("drop");
  ["dragenter", "dragover"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { chooseFile(e.dataTransfer.files[0]); });
  $("mode").addEventListener("change", function () {
    var ocr = $("mode").value === "ocr"; $("lang").hidden = !ocr; $("langLabel").hidden = !ocr;
    if (!ocr) $("settings").open = true;
  });
  $("go").addEventListener("click", run);
  $("rebuild").addEventListener("click", function () { showMenu(parseMenuText($("raw").value)); });
  $("q").addEventListener("input", renderCards);
  $("sort").addEventListener("change", renderCards);
  $("maxPrice").addEventListener("input", function () {
    state.max = +$("maxPrice").value;
    $("maxOut").textContent = state.max >= state.priceCeil ? "(any)" : "(up to " + state.max + ")";
    renderCards();
  });
  $("reset").addEventListener("click", function () {
    state.section = ""; state.diets = {}; state.max = state.priceCeil; $("maxPrice").value = state.max;
    $("maxOut").textContent = state.priceCeil ? "(any)" : "(no prices found)"; $("q").value = ""; $("sort").value = "menu";
    renderChips(); renderCards();
  });
})();
