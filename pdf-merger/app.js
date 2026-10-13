(function () {
  var items = [];
  var nextId = 1;
  var busy = false;
  var drag = null;

  var listEl = document.getElementById("list");
  var statusEl = document.getElementById("status");
  var mergeBtn = document.getElementById("merge");
  var clearBtn = document.getElementById("clear");
  var picker = document.getElementById("picker");
  var drop = document.getElementById("drop");
  var outName = document.getElementById("outname");
  var onePage = document.getElementById("onepage");
  var pageSize = document.getElementById("pagesize");
  var shareBtn = document.getElementById("share");
  var lastFile = null;

  var A4_W = 595.28, A4_H = 841.89, MARGIN = 36, GAP = 16, MAX_SIDE = 2400, MAX_PER_PAGE = 4;
  var GRIP = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>';

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function isReady(it) {
    return !it.error && !it.loading && (it.kind === "photos" ? it.images.length > 0 : !!it.buf);
  }

  function validCount() { return items.filter(isReady).length; }

  function pageCount(it) { return it.pick ? it.pick.length : (it.pages || 0); }

  function totalPages() {
    return items.filter(isReady).reduce(function (s, it) { return s + pageCount(it); }, 0);
  }

  function rangeErrorIndex() {
    for (var i = 0; i < items.length; i++) if (isReady(items[i]) && items[i].rangeError) return i;
    return -1;
  }

  // Any change to the list makes the last merged file stale, so it can no longer be shared.
  function idleStatus() {
    lastFile = null;
    shareBtn.hidden = true;
    var n = validCount();
    if (items.length === 0) { setStatus("Add at least one PDF or photo to begin."); return; }
    if (n < 1) { setStatus("None of the files could be read."); return; }
    var bad = rangeErrorIndex();
    if (bad >= 0) { setStatus("Fix the page range of item " + (bad + 1) + " before merging.", "err"); return; }
    var pages = totalPages();
    setStatus(n + (n === 1 ? " item, " : " items, ") + pages + (pages === 1 ? " page" : " pages") + " in total. Ready to merge.");
  }

  // "1,2,4,7-10" -> zero-based page indices in the order written. Empty means all pages; "10-7" counts down.
  function parseRange(text, max) {
    var parts = text.split(",");
    var pick = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(p);
      if (!m) return { error: "“" + p + "” is not a page or range. Write it like 1,2,4,7-10." };
      var a = +m[1], b = m[2] ? +m[2] : a;
      if (a < 1 || b < 1) return { error: "Page numbers start at 1." };
      if (a > max || b > max) return { error: "Page " + Math.max(a, b) + " does not exist. This file has " + max + " pages." };
      var step = a <= b ? 1 : -1;
      for (var n = a; ; n += step) { pick.push(n - 1); if (n === b) break; }
    }
    return { pick: pick.length ? pick : null };
  }

  function applyRange(it) {
    var r = parseRange(it.range, it.pages);
    it.pick = r.pick || null;
    it.rangeError = r.error || null;
  }

  function metaText(it) {
    if (it.loading) return "Reading...";
    if (it.error) return it.error;
    if (it.kind === "photos") return "1 page · " + it.images.length + (it.images.length === 1 ? " photo" : " photos");
    var pages = it.pick ? it.pick.length + " of " + it.pages + " pages" : it.pages + (it.pages === 1 ? " page" : " pages");
    return pages + " · " + fmtSize(it.size);
  }

  function makeBtn(label, glyph, disabled, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.textContent = glyph;
    b.disabled = disabled || busy;
    b.addEventListener("click", onClick);
    return b;
  }

  function releaseItem(it) {
    if (it.images) it.images.forEach(function (im) { try { URL.revokeObjectURL(im.url); } catch (e) {} });
  }

  function moveTo(from, to) {
    if (to < 0 || to >= items.length || to === from) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    render();
    idleStatus();
  }

  function removeAt(index) {
    releaseItem(items[index]);
    items.splice(index, 1);
    render();
    idleStatus();
  }

  function updateButtons() {
    mergeBtn.disabled = busy || validCount() < 1 || rangeErrorIndex() >= 0;
    clearBtn.disabled = busy || items.length === 0 || items.some(function (it) { return it.loading; });
  }

  function rangeField(it, meta) {
    var wrap = document.createElement("div");
    wrap.className = "range";
    var id = "range-" + it.id;
    var label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Pages";
    var inp = document.createElement("input");
    inp.id = id;
    inp.type = "text";
    inp.value = it.range;
    inp.placeholder = "All, or e.g. 1,2,4,7-10";
    inp.autocomplete = "off";
    inp.spellcheck = false;
    inp.disabled = busy;
    var err = document.createElement("div");
    err.className = "rerr";
    err.id = id + "-err";
    inp.setAttribute("aria-describedby", err.id);
    function show() {
      inp.classList.toggle("invalid", !!it.rangeError);
      inp.setAttribute("aria-invalid", it.rangeError ? "true" : "false");
      err.textContent = it.rangeError || "";
      err.hidden = !it.rangeError;
    }
    inp.addEventListener("input", function () {
      it.range = inp.value;
      applyRange(it);
      meta.textContent = metaText(it);
      show();
      updateButtons();
      idleStatus();
    });
    show();
    wrap.appendChild(label);
    wrap.appendChild(inp);
    var box = document.createElement("div");
    box.appendChild(wrap);
    box.appendChild(err);
    return box;
  }

  function render() {
    if (drag) { drag.dirty = true; return; }
    // Keep typing position in a page-range box when a row re-renders while another file loads.
    var ae = document.activeElement;
    var keep = ae && ae.id && ae.id.indexOf("range-") === 0 && listEl.contains(ae)
      ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;

    listEl.textContent = "";
    items.forEach(function (it, i) {
      var li = document.createElement("li");
      li.className = "row" + (it.error ? " bad" : "");

      var handle = document.createElement("div");
      handle.className = "num handle";
      handle.title = "Drag to reorder";
      handle.innerHTML = GRIP + "<span>" + String(i + 1).padStart(2, "0") + "</span>";
      handle.addEventListener("pointerdown", function (e) { startDrag(e, i, li, handle); });

      var info = document.createElement("div");
      info.className = "info";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = it.name;
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = metaText(it);
      info.appendChild(name);
      info.appendChild(meta);

      if (it.kind === "pdf" && isReady(it) && it.pages > 1) info.appendChild(rangeField(it, meta));

      if (it.kind === "photos" && it.images.length) {
        var th = document.createElement("div");
        th.className = "thumbs";
        it.images.forEach(function (im) {
          var img = document.createElement("img");
          img.src = im.url;
          img.alt = im.name;
          th.appendChild(img);
        });
        info.appendChild(th);
      }

      var acts = document.createElement("div");
      acts.className = "acts";
      acts.appendChild(makeBtn("Move up", "↑", i === 0, function () { moveTo(i, i - 1); }));
      acts.appendChild(makeBtn("Move down", "↓", i === items.length - 1, function () { moveTo(i, i + 1); }));
      acts.appendChild(makeBtn("Remove", "×", false, function () { removeAt(i); }));

      li.appendChild(handle);
      li.appendChild(info);
      li.appendChild(acts);
      listEl.appendChild(li);
    });
    updateButtons();

    if (keep) {
      var back = document.getElementById(keep.id);
      if (back) { back.focus(); try { back.setSelectionRange(keep.s, keep.e); } catch (e) {} }
    }
  }

  // Drag a row by its number. Other rows slide out of the way; the list order changes on release.
  function startDrag(e, from, li, handle) {
    if (busy || drag || e.button !== 0 || items.length < 2) return;
    e.preventDefault();
    var rows = Array.prototype.slice.call(listEl.children);
    var gap = parseFloat(getComputedStyle(listEl).rowGap) || 8;
    drag = {
      from: from, to: from, li: li, rows: rows, dirty: false,
      startY: e.clientY, startScroll: window.scrollY,
      shift: li.getBoundingClientRect().height + gap,
      mids: rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + window.scrollY + b.height / 2; })
    };
    li.classList.add("dragging");
    listEl.classList.add("sorting");
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener("pointermove", onDragMove);
    handle.addEventListener("pointerup", onDragEnd);
    handle.addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(e) {
    if (!drag) return;
    if (e.clientY < 48) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 48) window.scrollBy(0, 12);
    var dy = e.clientY - drag.startY + (window.scrollY - drag.startScroll);
    drag.li.style.transform = "translateY(" + dy + "px)";
    var center = drag.mids[drag.from] + dy;
    var to = 0;
    drag.mids.forEach(function (m, j) { if (j !== drag.from && m < center) to++; });
    drag.to = to;
    drag.rows.forEach(function (r, j) {
      if (j === drag.from) return;
      var s = j > drag.from && j <= to ? -drag.shift : j < drag.from && j >= to ? drag.shift : 0;
      r.style.transform = s ? "translateY(" + s + "px)" : "";
    });
  }

  function onDragEnd(e) {
    var handle = e.currentTarget;
    handle.removeEventListener("pointermove", onDragMove);
    handle.removeEventListener("pointerup", onDragEnd);
    handle.removeEventListener("pointercancel", onDragEnd);
    if (!drag) return;
    var d = drag;
    drag = null;
    listEl.classList.remove("sorting");
    if (e.type === "pointercancel") d.to = d.from;
    if (d.to !== d.from) { moveTo(d.from, d.to); return; }
    d.rows.forEach(function (r) { r.style.transform = ""; });
    d.li.classList.remove("dragging");
    if (d.dirty) render();
  }

  function isPdf(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }
  function isImage(file) {
    return /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
  }

  function loadImgElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }

  // Decode any browser-readable image, apply its orientation, shrink very large photos, return JPEG bytes.
  async function decodeImage(file) {
    var src;
    try { src = await createImageBitmap(file); }
    catch (e) { src = await loadImgElement(file); }
    var sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    var scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    var w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    var blob = await new Promise(function (res) { canvas.toBlob(res, "image/jpeg", 0.9); });
    if (!blob) throw new Error("encode failed");
    var bytes = await blob.arrayBuffer();
    return { name: file.name, bytes: bytes, w: w, h: h, size: blob.size, url: URL.createObjectURL(blob) };
  }

  function photoName(it) {
    if (it.images.length === 1) return it.images[0].name;
    return "Photo page: " + it.images.map(function (im) { return im.name; }).join(", ");
  }

  async function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    var skipped = 0, failedPhotos = 0;
    var group = null;
    for (var k = 0; k < files.length; k++) {
      var file = files[k];
      if (isPdf(file)) {
        var item = { id: nextId++, kind: "pdf", name: file.name, size: file.size, loading: true, pages: 0, buf: null, error: null,
          range: "", pick: null, rangeError: null };
        items.push(item);
        render();
        try {
          item.buf = await file.arrayBuffer();
          var doc = await PDFLib.PDFDocument.load(item.buf);
          item.pages = doc.getPageCount();
        } catch (e) {
          item.buf = null;
          item.error = /encrypt/i.test(String(e && e.message))
            ? "Password-protected. Remove the password and add it again."
            : "Could not read this file. It may be damaged.";
        }
        item.loading = false;
        render();
      } else if (isImage(file)) {
        var target;
        if (onePage.checked && group && group.images.length < MAX_PER_PAGE) {
          target = group;
        } else {
          target = { id: nextId++, kind: "photos", name: file.name, size: 0, loading: true, pages: 1, images: [], error: null };
          items.push(target);
          if (onePage.checked) group = target;
        }
        target.loading = true;
        render();
        try {
          var im = await decodeImage(file);
          target.images.push(im);
          target.name = photoName(target);
        } catch (e) {
          failedPhotos++;
          if (target.images.length === 0) {
            target.error = "Could not open this photo. Try a JPG or PNG.";
            target.name = file.name;
          }
        }
        target.loading = false;
        render();
      } else {
        skipped++;
      }
    }
    picker.value = "";
    idleStatus();
    if (skipped) setStatus(skipped + (skipped === 1 ? " file was" : " files were") + " skipped because it is not a PDF or a photo.", "err");
    else if (failedPhotos) setStatus(failedPhotos + (failedPhotos === 1 ? " photo" : " photos") + " could not be opened. Try JPG or PNG.", "err");
  }

  function cleanName(raw) {
    var n = (raw || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
    if (!n) n = "merged";
    if (!/\.pdf$/i.test(n)) n += ".pdf";
    return n;
  }

  var SIZES = { a4: { w: A4_W, h: A4_H }, letter: { w: 612, h: 792 } };

  // Visible size of a page: its crop box, turned if the page is rotated 90 or 270 degrees.
  function visibleBox(page) {
    var box = page.getCropBox();
    var rot = ((page.getRotation().angle % 360) + 360) % 360;
    var side = rot === 90 || rot === 270;
    return { box: box, side: side, w: side ? box.height : box.width, h: side ? box.width : box.height };
  }

  // The one size every page gets, in portrait (w <= h); each page keeps its own orientation. null keeps sizes as they are.
  async function targetSize(choice, ready) {
    if (choice === "original") return null;
    if (SIZES[choice]) return SIZES[choice];
    var first = ready[0];
    if (first.kind === "photos") return SIZES.a4;
    var doc = await PDFLib.PDFDocument.load(first.buf);
    var v = visibleBox(doc.getPage(first.pick ? first.pick[0] : 0));
    return { w: Math.min(v.w, v.h), h: Math.max(v.w, v.h) };
  }

  // Scale a page to fit the target size and center it. Instead of moving the content, the page frame
  // is placed around it, so links and form fields stay where they belong.
  function fitPage(page, t) {
    var v = visibleBox(page);
    var land = v.w > v.h;
    var tw = land ? t.h : t.w, th = land ? t.w : t.h;
    if (Math.abs(v.w - tw) < 1 && Math.abs(v.h - th) < 1) return;
    var s = Math.min(tw / v.w, th / v.h);
    var uw = v.side ? th : tw, uh = v.side ? tw : th;
    var b = v.box;
    page.scaleContent(s, s);
    page.scaleAnnotations(s, s);
    var x = s * b.x - (uw - s * b.width) / 2, y = s * b.y - (uh - s * b.height) / 2;
    page.setMediaBox(x, y, uw, uh);
    page.setCropBox(x, y, uw, uh);
    page.setBleedBox(x, y, uw, uh);
    page.setTrimBox(x, y, uw, uh);
    page.setArtBox(x, y, uw, uh);
  }

  // Place 1 photo full page (page turns landscape for a wide photo), 2 stacked, 3+ in a two-column grid.
  async function addPhotoPage(out, it, size) {
    var n = it.images.length;
    var pw = (size || SIZES.a4).w, ph = (size || SIZES.a4).h;
    if (n === 1 && it.images[0].w > it.images[0].h) { var t = pw; pw = ph; ph = t; }
    var page = out.addPage([pw, ph]);
    var cols = n <= 2 ? 1 : 2;
    var rows = Math.ceil(n / cols);
    var cellW = (pw - 2 * MARGIN - (cols - 1) * GAP) / cols;
    var cellH = (ph - 2 * MARGIN - (rows - 1) * GAP) / rows;
    for (var i = 0; i < n; i++) {
      var im = it.images[i];
      var emb = await out.embedJpg(im.bytes);
      var s = Math.min(cellW / im.w, cellH / im.h);
      var dw = im.w * s, dh = im.h * s;
      var col = i % cols, row = Math.floor(i / cols);
      var x = MARGIN + col * (cellW + GAP) + (cellW - dw) / 2;
      var y = ph - MARGIN - (row + 1) * cellH - row * GAP + (cellH - dh) / 2;
      page.drawImage(emb, { x: x, y: y, width: dw, height: dh });
    }
  }

  async function merge() {
    var ready = items.filter(isReady);
    if (ready.length < 1 || busy || rangeErrorIndex() >= 0) return;
    busy = true;
    render();
    setStatus("Merging " + ready.length + (ready.length === 1 ? " item..." : " items..."));
    try {
      var out = await PDFLib.PDFDocument.create();
      var size = await targetSize(pageSize.value, ready);
      for (var i = 0; i < ready.length; i++) {
        var it = ready[i];
        if (it.kind === "photos") {
          await addPhotoPage(out, it, size);
        } else {
          var src = await PDFLib.PDFDocument.load(it.buf);
          var pages = await out.copyPages(src, it.pick || src.getPageIndices());
          pages.forEach(function (p) {
            if (size) fitPage(p, size);
            out.addPage(p);
          });
        }
      }
      var bytes = await out.save();
      var filename = cleanName(outName.value);
      outName.value = filename;
      var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      setStatus("Saved " + filename + " (" + out.getPageCount() + " pages, " + fmtSize(bytes.length) + ").", "ok");
      // Phones: offer the system share sheet (WhatsApp, Mail, Files...). It needs a fresh tap, so it gets its own button.
      var file = new File([bytes], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        lastFile = file;
        shareBtn.hidden = false;
      }
    } catch (e) {
      setStatus("Merging failed: " + ((e && e.message) || "unknown error") + ".", "err");
    }
    busy = false;
    render();
  }

  picker.addEventListener("change", function () { if (picker.files && picker.files.length) addFiles(picker.files); });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  mergeBtn.addEventListener("click", merge);
  pageSize.addEventListener("change", idleStatus);
  shareBtn.addEventListener("click", function () {
    if (!lastFile) return;
    navigator.share({ files: [lastFile], title: lastFile.name }).catch(function (err) {
      if (err && err.name !== "AbortError") setStatus("Sharing failed: " + (err.message || "unknown error") + ".", "err");
    });
  });
  clearBtn.addEventListener("click", function () {
    items.forEach(releaseItem);
    items = [];
    render();
    idleStatus();
  });

  render();
})();
