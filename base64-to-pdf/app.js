(function () {
  const $ = (id) => document.getElementById(id);
  const input = $("input"), sigHead = $("sigHead"), sigMsg = $("sigMsg"),
        facts = $("facts"), sizeEl = $("size"), pagesEl = $("pages"),
        dlBtn = $("download"), fileIn = $("file"), toast = $("toast"),
        nameIn = $("filename"), drop = $("drop");

  let bytes = null;
  let previewUrl = null;
  const frame = $("frame"), openTab = $("openTab"), empty = $("empty"), emptyMsg = $("emptyMsg");
  const EMPTY_MSG = emptyMsg.textContent;

  function clean(text) {
    return text
      .replace(/^data:[^,]*;base64,/i, "")
      .replace(/\s+/g, "")
      .replace(/-/g, "+").replace(/_/g, "/")
      .replace(/^"+|"+$/g, "");
  }

  function decode(b64) {
    const pad = b64.length % 4;
    if (pad === 1) throw new Error("Length is not valid Base64.");
    if (pad) b64 += "=".repeat(4 - pad);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error("Contains characters that are not Base64.");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  function countPages(u8) {
    // Rough count of page objects; good enough as a sanity check.
    const text = new TextDecoder("latin1").decode(u8);
    const m = text.match(/\/Type\s*\/Page(?![s\w])/g);
    return m ? m.length : "?";
  }

  function setSig(state, head, msg) {
    sigHead.className = "sig-head " + state;
    sigHead.textContent = head;
    sigMsg.className = "sig-msg" + (state === "bad" ? " bad" : "");
    sigMsg.textContent = msg;
  }

  function clearPreview(msg) {
    frame.hidden = true;
    frame.removeAttribute("src");
    openTab.hidden = true;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    emptyMsg.textContent = msg || EMPTY_MSG;
    empty.hidden = false;
  }

  function showPreview() {
    if (!bytes) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    frame.src = previewUrl;
    openTab.href = previewUrl;
    openTab.hidden = false;
    empty.hidden = true;
    frame.hidden = false;
  }

  let lastRaw = null;
  function update() {
    const raw = input.value.trim();
    if (raw === lastRaw) return;
    lastRaw = raw;
    toast.textContent = ""; toast.className = "toast";
    bytes = null; dlBtn.disabled = true; facts.hidden = true;
    if (!raw) { setSig("idle", "—", "Waiting for input."); clearPreview(); return; }

    let u8;
    try { u8 = decode(clean(raw)); }
    catch (e) { setSig("bad", "error", e.message); clearPreview("No preview: the input isn't valid Base64."); return; }

    const head = new TextDecoder("latin1").decode(u8.slice(0, 8));
    sizeEl.textContent = formatSize(u8.length);
    facts.hidden = false;

    if (head.startsWith("%PDF-")) {
      bytes = u8;
      pagesEl.textContent = countPages(u8);
      setSig("ok", head.trim(), "Valid PDF header.");
      dlBtn.disabled = false;
      showPreview();
      return;
    }
    clearPreview("No preview: the decoded data isn't a PDF.");
    if (/^[0-9A-Fa-f]+$/.test(raw.slice(0, 16)) && raw.startsWith("255044462D")) {
      pagesEl.textContent = "?";
      setSig("bad", "hex", "This looks like a hex string, not Base64. Convert it to Base64 first.");
    } else if (head.startsWith("JVBER")) {
      pagesEl.textContent = "?";
      setSig("bad", "2× b64", "Decoded result is Base64 again: the PDF was encoded twice.");
    } else {
      pagesEl.textContent = "?";
      const shown = head.replace(/[^\x20-\x7E]/g, "·");
      setSig("bad", shown || "?", "Decoded fine, but it doesn't start with %PDF-, so it's not a PDF.");
    }
  }

  function download() {
    if (!bytes) return;
    let name = nameIn.value.trim() || "document.pdf";
    if (!/\.pdf$/i.test(name)) name += ".pdf";
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("ok", "Downloaded " + name + ".");
  }

  function showToast(kind, msg) {
    toast.className = "toast" + (kind ? " " + kind : "");
    toast.textContent = msg;
  }

  function loadFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      input.value = String(r.result);
      const base = f.name.replace(/\.[^.]+$/, "");
      if (base) nameIn.value = base + ".pdf";
      update();
    };
    r.onerror = () => showToast("bad", "Couldn't read " + f.name + ".");
    r.readAsText(f);
  }

  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(update, 150); });
  dlBtn.addEventListener("click", download);
  $("clear").addEventListener("click", () => { input.value = ""; update(); input.focus(); });
  $("loadBtn").addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", () => { loadFile(fileIn.files[0]); fileIn.value = ""; });

  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove("dragging");
  }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
})();
