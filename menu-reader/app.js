// Menu Reader: photo -> text (Tesseract.js on this device, or Claude) -> dishes -> a picture per dish -> filterable cards.
var TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
var CLAUDE_MODEL = "claude-sonnet-5-5";
var DIETS = [["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["spicy", "Spicy"], ["gluten-free", "Gluten-free"]];
var KEYS = ["claudeKey", "gKey", "gCx"];

var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
var state = { src: null, corners: [], items: [], sections: [], section: "", diets: {}, max: 0, priceCeil: 0 };

/* ---------- reading the text ---------- */
var PRICE_END = /(?:(?:[$€£]\s?\d{1,4}(?:[.,]\d{1,2})?)|(?:\d{1,4}[.,]\d{2}\s?(?:[$€£]|eur|usd|gbp)?)|(?:\d{1,4}\s?[$€£]))\s*$/i;
var CUR = "(?:c[z2]{1,2}k|kč|kc|eur|usd|gbp|chf|pln|huf|sek|nok|dkk|lei|ron)";
var PRICE_CUR = new RegExp("(?:^|[^\\d.,])(\\d{1,5}(?:[.,]\\d{1,2})?)\\s?" + CUR + "(?![A-Za-z0-9])", "i");
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

function mostlyCaps(letters) {
  return letters.length >= 3 && letters.replace(/[^A-ZÀ-Þ]/g, "").length >= letters.length * 0.8;
}
function titleCase(t) {
  return t.toLowerCase().replace(/(^|[\s\/-])([a-zà-ÿ])/g, function (_, a, b) { return a + b.toUpperCase(); });
}

// Turns raw OCR text into [{section, name, price, priceText, description, search, tags}].
function parseMenuText(text) {
  var lines = text.split(/\r?\n/).map(function (l) {
    return l.replace(/[|_~\\]+/g, " ").replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim();
  }).filter(function (l) { return (l.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 3; });
  var items = [], section = "", top = "", last = null;
  lines.forEach(function (line) {
    var priceText = "", m = PRICE_CUR.exec(line);
    if (m) { priceText = m[1] + " " + /[A-Za-zč]+/.exec(m[0].slice(m[0].indexOf(m[1]) + m[1].length))[0].toUpperCase().replace(/^C[Z2]+K$/, "CZK"); line = line.slice(0, m.index).trim(); }
    else if (m = PRICE_END.exec(line)) { priceText = m[0].trim(); line = line.slice(0, m.index).trim(); }
    else if ((m = PRICE_BARE.exec(line)) && line.split(" ").length > 2) { priceText = m[1]; line = line.slice(0, m.index).trim(); }
    if (!line) return;
    var letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    var isCaps = mostlyCaps(letters);
    if (!priceText && isCaps && line.split(" ").length <= 4) {
      var head = titleCase(line.replace(/(\s+\S*\d\S*)+$/, ""));
      if (/^with\b/i.test(line) && top) section = top + " " + head.charAt(0).toLowerCase() + head.slice(1);
      else section = top = head;
      last = null; return;
    }
    if (!priceText && last && !last.description && (/^[a-zà-ÿ(]/.test(line) || line.length > 45)) { last.description = line; return; }
    var name = line, desc = "", cut = /\s[-–—]\s|:|,/.exec(line);
    if (cut && cut.index >= 3) { name = line.slice(0, cut.index); desc = line.slice(cut.index + cut[0].length).trim(); }
    name = name.replace(/^[\d.\-•*\s]+/, "").trim();
    name = name.replace(/^(?:\S\s+)+(?=\S{2})/, "");
    if (mostlyCaps(name.replace(/[^A-Za-zÀ-ÿ]/g, ""))) name = titleCase(name);
    last = { section: section, name: name, price: priceText ? parsePrice(priceText) : null,
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

// Evens out shadows and the yellow cast of a photo taken in poor light: divide by a blurred copy, then stretch contrast.
function enhance(c) {
  var w = c.width, h = c.height, x = c.getContext("2d"), img = x.getImageData(0, 0, w, h), d = img.data;
  var s = document.createElement("canvas"); s.width = Math.max(1, w >> 5); s.height = Math.max(1, h >> 5);
  var sx = s.getContext("2d"); sx.imageSmoothingQuality = "high"; sx.drawImage(c, 0, 0, s.width, s.height);
  var b = document.createElement("canvas"); b.width = w; b.height = h;
  var bx = b.getContext("2d"); bx.imageSmoothingQuality = "high"; bx.drawImage(s, 0, 0, w, h);
  var bg = bx.getImageData(0, 0, w, h).data;
  for (var i = 0; i < d.length; i += 4) {
    var g = (d[i] + d[i + 1] + d[i + 2]) / 3, k = (bg[i] + bg[i + 1] + bg[i + 2]) / 3 + 1;
    var v = Math.max(0, Math.min(255, ((g / k) * 255 * 1.12 - 90) * 255 / 150));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// One text line per OCR line. Keeps words the reader is fairly sure of, drops anything beside the page edge (the cut-off
// facing page), and after a big gap keeps only numbers, so a price column survives but stray marks past it do not.
function linesFromOcr(data, width) {
  return (data.lines || []).map(function (l) {
    var out = [], prev = null;
    var words = l.words || [];
    words.forEach(function (w, i) {
      var b = w.bbox, h = Math.max(1, b.y1 - b.y0), nx = words[i + 1];
      if (w.text.length <= 2 && !out.length && nx && nx.bbox.x0 - b.x1 > 2 * h) return;
      if (w.confidence < 50 || !/[A-Za-z0-9À-ÿ]/.test(w.text)) return;
      if (b.x0 > width * 0.88 || b.x1 >= width - 8) return;
      if (prev && b.x0 - prev.x1 > 4 * h && !/\d/.test(w.text) && !/^(czk|kč|eur|usd)/i.test(w.text)) return;
      out.push(w.text); if (w.text.length > 2) prev = b;
    });
    return out.join(" ");
  }).join("\n");
}

// Cuts the quad [TL, TR, BR, BL] out of src and maps it onto a flat rectangle (perspective correction).
function warp(src, q, maxSide) {
  var d = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  var W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2])), k = Math.min(1, maxSide / Math.max(W, H));
  var w = Math.max(2, Math.round(W * k)), h = Math.max(2, Math.round(H * k));
  var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
  var sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, A, B, C, D, E, F, G = 0, Hh = 0;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) { A = x1 - x0; B = x3 - x0; C = x0; D = y1 - y0; E = y3 - y0; F = y0; }
  else {
    var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, det = dx1 * dy2 - dx2 * dy1;
    G = (sx * dy2 - dx2 * sy) / det; Hh = (dx1 * sy - sx * dy1) / det;
    A = x1 - x0 + G * x1; B = x3 - x0 + Hh * x3; C = x0; D = y1 - y0 + G * y1; E = y3 - y0 + Hh * y3; F = y0;
  }
  var sw = src.width, sh = src.height, sd = src.getContext("2d").getImageData(0, 0, sw, sh).data;
  var out = document.createElement("canvas"); out.width = w; out.height = h;
  var ox = out.getContext("2d"), img = ox.createImageData(w, h), od = img.data;
  for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
    var u = i / (w - 1), v = j / (h - 1), z = G * u + Hh * v + 1;
    var px = (A * u + B * v + C) / z, py = (D * u + E * v + F) / z;
    px = Math.max(0, Math.min(sw - 1.001, px)); py = Math.max(0, Math.min(sh - 1.001, py));
    var ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, o = (iy * sw + ix) * 4, t = (j * w + i) * 4;
    for (var c = 0; c < 3; c++) {
      od[t + c] = (sd[o + c] * (1 - fx) + sd[o + 4 + c] * fx) * (1 - fy) + (sd[o + sw * 4 + c] * (1 - fx) + sd[o + sw * 4 + 4 + c] * fx) * fy;
    }
    od[t + 3] = 255;
  }
  ox.putImageData(img, 0, 0);
  return out;
}

var NS = "http://www.w3.org/2000/svg";
function drawEditor() {
  var W = state.src.width, H = state.src.height, ov = $("ov"), r = W / 35;
  ov.setAttribute("viewBox", "0 0 " + W + " " + H); ov.textContent = "";
  var poly = document.createElementNS(NS, "polygon");
  poly.setAttribute("points", state.corners.map(function (p) { return p.join(","); }).join(" "));
  poly.setAttribute("fill", "rgba(10,108,116,.12)"); poly.setAttribute("stroke", "#0fbcc8"); poly.setAttribute("stroke-width", W / 250);
  ov.appendChild(poly);
  state.corners.forEach(function (p, n) {
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", r); c.setAttribute("stroke-width", W / 400);
    c.addEventListener("pointerdown", function (e) {
      c.setPointerCapture(e.pointerId);
      var rect = ov.getBoundingClientRect();
      c.onpointermove = function (m) {
        state.corners[n] = [Math.max(0, Math.min(W, (m.clientX - rect.left) * W / rect.width)), Math.max(0, Math.min(H, (m.clientY - rect.top) * H / rect.height))];
        c.setAttribute("cx", state.corners[n][0]); c.setAttribute("cy", state.corners[n][1]);
        poly.setAttribute("points", state.corners.map(function (q) { return q.join(","); }).join(" "));
      };
      c.onpointerup = function () { c.onpointermove = null; };
    });
    ov.appendChild(c);
  });
}
// Finds the page: the largest bright area (Otsu threshold on a blurred, shrunken copy), holes filled, then its four extreme
// points along the diagonals. Returns [TL, TR, BR, BL] in src pixels, or null when no clear page is found.
function detectPage(src) {
  var k = 360 / Math.max(src.width, src.height), w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
  var c = document.createElement("canvas"); c.width = w; c.height = h;
  var x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h);
  var px = x.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), i, j;
  for (i = 0; i < w * h; i++) L[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
  for (var pass = 0; pass < 2; pass++) {   // box blur, so printed text melts into the paper
    var T = new Float32Array(w * h), r = 3;
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
      var sum = 0, n = 0;
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var xx = i + dx, yy = j + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += L[yy * w + xx]; n++; }
      }
      T[j * w + i] = sum / n;
    }
    L = T;
  }
  var hist = new Array(256).fill(0), total = w * h;
  for (i = 0; i < total; i++) hist[Math.min(255, L[i] | 0)]++;
  var sumAll = 0; for (i = 0; i < 256; i++) sumAll += i * hist[i];
  var wB = 0, sumB = 0, best = 0, thr = 128;
  for (i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB || wB === total) continue;
    sumB += i * hist[i];
    var mB = sumB / wB, mF = (sumAll - sumB) / (total - wB), between = wB * (total - wB) * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = i; }
  }
  var mask = new Uint8Array(total); for (i = 0; i < total; i++) mask[i] = L[i] > thr ? 1 : 0;
  var label = new Int32Array(total), sizes = [0], id = 0, stack = [];
  for (i = 0; i < total; i++) {
    if (!mask[i] || label[i]) continue;
    id++; sizes[id] = 0; stack.push(i); label[i] = id;
    while (stack.length) {
      var p = stack.pop(), pxl = p % w, pyl = (p / w) | 0; sizes[id]++;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = pxl + d[0], ny = pyl + d[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        var q = ny * w + nx; if (mask[q] && !label[q]) { label[q] = id; stack.push(q); }
      });
    }
  }
  var main = 0; for (i = 1; i <= id; i++) if (!main || sizes[i] > sizes[main]) main = i;
  if (!main || sizes[main] < total * 0.15) return null;
  var tl = null, tr = null, br = null, bl = null, a, b;
  for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
    if (label[j * w + i] !== main) continue;
    a = i + j; b = i - j;
    if (!tl || a < tl.a) tl = { a: a, p: [i, j] };
    if (!br || a > br.a) br = { a: a, p: [i, j] };
    if (!tr || b > tr.a) tr = { a: b, p: [i, j] };
    if (!bl || b < bl.a) bl = { a: b, p: [i, j] };
  }
  var quad = [tl, tr, br, bl].map(function (o) { return [o.p[0] / k, o.p[1] / k]; });
  var area = 0; for (i = 0; i < 4; i++) { var u = quad[i], v = quad[(i + 1) % 4]; area += u[0] * v[1] - v[0] * u[1]; }
  return Math.abs(area) / 2 > src.width * src.height * 0.15 ? quad : null;
}

function resetCorners() {
  var W = state.src.width, H = state.src.height;
  var m = Math.round(Math.min(W, H) * 0.06);
  state.corners = [[m, m], [W - m, m], [W - m, H - m], [m, H - m]]; drawEditor();
}

function readWithOcr(lang) {
  setStatus("Loading the text reader…", false, 0);
  var width = 0;
  return Promise.all([window.Tesseract ? 0 : loadScript(TESSERACT_URL), Promise.resolve(warp(state.src, state.corners, 2200)).then(function (c) { width = c.width; return enhance(c); })]).then(function (r) {
    return window.Tesseract.recognize(r[1], lang, { logger: function (m) {
      if (m.status === "recognizing text") setStatus("Reading the menu… " + Math.round(m.progress * 100) + "%", false, m.progress);
      else setStatus("Preparing: " + m.status + "…", false, 0);
    } });
  }).then(function (res) { return { text: linesFromOcr(res.data, width) }; });
}

function readWithClaude(key) {
  setStatus("Asking Claude to read the menu…", false, -1);
  return Promise.resolve(warp(state.src, state.corners, 1800)).then(function (c) {
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
  if (!f || !/^image\//.test(f.type)) { setStatus("That file is not an image.", true); return Promise.resolve(); }
  return toCanvas(f, 2600).then(function (c) {
    state.src = c;
    var st = $("stage"); st.width = c.width; st.height = c.height; st.getContext("2d").drawImage(c, 0, 0);
    $("crop").hidden = false; resetCorners();
    var found = detectPage(c);
    if (found) { state.corners = found; drawEditor(); }
    setStatus(found ? "Page found automatically. If the dots are off (a facing page can get included), drag them onto the corners, then read the menu." : "");
    $("go").disabled = false;
  }).catch(function () { setStatus("Could not open that image.", true); });
}

function finish(res) {
  var items = res.items || parseMenuText(res.text);
  if (res.text !== undefined) { $("raw").value = res.text; $("rawBox").hidden = false; $("rawBox").open = true; }
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
  (mode === "claude" ? readWithClaude(key) : readWithOcr($("lang").value))
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
  $("resetCorners").addEventListener("click", resetCorners);
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
