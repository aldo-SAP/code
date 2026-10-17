/*
 * Files embedded in the invoice (EmbeddedDocumentBinaryObject): finding them, the preview window and the download.
 * EdocAttachments(h) needs { state, $, T, val, formatSize } and returns { collect, preview, download, close, extFor }.
 */
window.EdocAttachments = function (h) {
  "use strict";
  const { state, $, T, val, formatSize } = h;
  function collectAttachments() {
    state.atts = []; state.attIndex = new Map(); state.cache.forEach((c) => c.url && URL.revokeObjectURL(c.url)); state.cache = new Map();
    const all = state.root.getElementsByTagName("*");
    for (const el of all) {
      if (el.localName !== "EmbeddedDocumentBinaryObject") continue;
      let adr = el.parentElement;
      while (adr && adr.localName !== "AdditionalDocumentReference" && adr.localName !== "DocumentReference") adr = adr.parentElement;
      const b64 = el.textContent.replace(/\s+/g, "");
      const pad = (b64.match(/=+$/) || [""])[0].length;
      const i = state.atts.length;
      const head = sniffB64(b64);
      const mime = el.getAttribute("mimeCode") || head || "";
      const filename = el.getAttribute("filename") || (adr ? val(adr, "ID") : "") || "attachment-" + (i + 1) + extFor(mime);
      let warn = "";
      if (mime === "application/pdf" && head && head !== "application/pdf") warn = "Declared as PDF, but the content doesn't start with %PDF.";
      state.atts.push({ el, b64, filename, mime, sniffed: head, size: Math.max(0, Math.floor(b64.length * 3 / 4) - pad),
        desc: adr ? val(adr, "DocumentDescription") : "", ref: adr ? val(adr, "ID") : "", warn });
      state.attIndex.set(el, i);
    }
  }
  function sniffB64(b64) {
    let bytes;
    try { bytes = atob(b64.slice(0, 16).replace(/[^A-Za-z0-9+/]/g, "").slice(0, 12)); } catch (e) { return ""; }
    if (bytes.startsWith("%PDF")) return "application/pdf";
    if (bytes.startsWith("\x89PNG")) return "image/png";
    if (bytes.startsWith("\xFF\xD8\xFF")) return "image/jpeg";
    if (bytes.startsWith("GIF8")) return "image/gif";
    if (bytes.startsWith("PK")) return "application/zip";
    if (/^\s*</.test(bytes) || bytes.startsWith("\xEF\xBB\xBF<")) return "application/xml";
    return "";
  }
  function extFor(mime) {
    return ({ "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "application/zip": ".zip",
      "application/xml": ".xml", "text/xml": ".xml", "text/csv": ".csv", "text/plain": ".txt",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "application/vnd.oasis.opendocument.spreadsheet": ".ods" })[mime] || "";
  }
  function attBytes(i) {
    const a = state.atts[i];
    let c = state.cache.get(i);
    if (!c) {
      let b64 = a.b64.replace(/-/g, "+").replace(/_/g, "/");
      if (b64.length % 4) b64 += "=".repeat(4 - (b64.length % 4));
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
      const type = a.sniffed || a.mime || "application/octet-stream";
      c = { u8, type, url: URL.createObjectURL(new Blob([u8], { type })) };
      state.cache.set(i, c);
    }
    return c;
  }

  const viewer = $("viewer"), vBody = $("vBody");
  let viewing = -1;
  function preview(i) {
    const a = state.atts[i];
    let c;
    try { c = attBytes(i); } catch (e) { alert(T("This attachment isn't valid Base64, so it can't be opened.")); return; }
    // iPhone and iPad draw a PDF in a frame as one still page: there the file opens in Safari's own viewer (all pages, scrolling, zoom)
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (c.type === "application/pdf" && iOS && window.open(c.url, "_blank")) return;
    viewing = i;
    $("vTitle").textContent = a.filename + " · " + formatSize(c.u8.length);
    $("vOpen").href = c.url;
    vBody.textContent = "";
    const t = c.type;
    if (t === "application/pdf") {
      const f = document.createElement("iframe");
      f.title = T("Preview of {name}", { name: a.filename }); f.src = c.url;
      vBody.appendChild(f);
    } else if (/^image\//.test(t)) {
      const img = document.createElement("img"); img.alt = a.filename; img.src = c.url; vBody.appendChild(img);
    } else if (/xml|json|csv|text\//.test(t) || /\.(xml|txt|csv|json)$/i.test(a.filename)) {
      const pre = document.createElement("pre");
      pre.textContent = new TextDecoder("utf-8").decode(c.u8.subarray(0, 3 * 1048576));
      vBody.appendChild(pre);
    } else {
      const d = document.createElement("div"); d.className = "msg";
      d.textContent = T("No in-page preview for {type}. Use Download to open it.", { type: t || T("this file type") });
      vBody.appendChild(d);
    }
    if (typeof viewer.showModal === "function") viewer.showModal(); else viewer.setAttribute("open", "");
  }
  function closeViewer() { vBody.textContent = ""; viewing = -1; if (viewer.open) viewer.close(); }
  function download(i) {
    const a = state.atts[i];
    let c;
    try { c = attBytes(i); } catch (e) { alert(T("This attachment isn't valid Base64, so it can't be saved.")); return; }
    const blob = new Blob([c.u8], { type: c.type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = a.filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }
  $("vClose").addEventListener("click", closeViewer);
  $("vDownload").addEventListener("click", () => { if (viewing >= 0) download(viewing); });
  viewer.addEventListener("close", () => { vBody.textContent = ""; viewing = -1; });
  viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
  return { collect: collectAttachments, preview, download, close: closeViewer, extFor };
};
