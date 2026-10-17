/*
 * A small PDF writer for the check report: A4 pages of wrapped text in the standard Helvetica fonts (no font is embedded, so nothing is downloaded and the
 * file is small), a coloured bar beside the lines of a block, and links. It writes text in the Western European character set (WinAnsi);
 * a character outside it is written as "?".
 *
 * EdocPdf.build({ title, footer, blocks }) -> Uint8Array. A block is
 *   { text, size, bold, color, gap }                    a paragraph (gap = space above)
 *   { text, size, bold, bar, fill, indent, gap }        a paragraph with a bar at its left and a tinted background (bar and fill are colours)
 *   { text, size, link, bar, fill, indent }             the same, written as a link to the address in link
 *   { cols: [{ label, value }], size, gap }          fields side by side, "label value" in each
 * Colours are "#rrggbb".
 */
(function () {
  "use strict";
  // widths of the characters 32-126 in Helvetica and Helvetica-Bold (thousandths of the font size)
  const W = [
    "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584",
    "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584"
  ].map((s) => s.split(" ").map(Number));
  const WIN = { 8364: 0x80, 8218: 0x82, 402: 0x83, 8222: 0x84, 8230: 0x85, 8224: 0x86, 8225: 0x87, 710: 0x88, 8240: 0x89, 352: 0x8A, 8249: 0x8B, 338: 0x8C, 381: 0x8E,
    8216: 0x91, 8217: 0x92, 8220: 0x93, 8221: 0x94, 8226: 0x95, 8211: 0x96, 8212: 0x97, 732: 0x98, 8482: 0x99, 353: 0x9A, 8250: 0x9B, 339: 0x9C, 382: 0x9E, 376: 0x9F };
  // the character as the byte the PDF holds (WinAnsi), or "?"
  function enc(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c < 127) return ch;
    if (c >= 160 && c <= 255) return ch;
    if (WIN[c]) return String.fromCharCode(WIN[c]);
    if (c === 0x2003 || c === 0x2002 || c === 0x202F) return " ";
    return "?";
  }
  const clean = (s) => String(s == null ? "" : s).replace(/[\t\r\n]+/g, " ").split("").map(enc).join("");
  // width of a character in a font; accented letters are as wide as their base letter
  function cw(ch, bold) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c < 127) return W[bold ? 1 : 0][c - 32];
    if (c >= 192 && c <= 255) {
      const base = ch.normalize("NFD").charAt(0), b = base.charCodeAt(0);
      if (b >= 32 && b < 127 && base !== ch) return W[bold ? 1 : 0][b - 32];
    }
    return 556;
  }
  const width = (s, size, bold) => { let w = 0; for (const ch of s) w += cw(ch, bold); return w * size / 1000; };
  // breaks a text into lines no wider than max; a word wider than a line is broken inside
  function wrap(text, size, bold, max) {
    const lines = [];
    let line = "";
    const put = (word) => {
      const trial = line ? line + " " + word : word;
      if (width(trial, size, bold) <= max) { line = trial; return; }
      if (line) { lines.push(line); line = ""; }
      if (width(word, size, bold) <= max) { line = word; return; }
      let part = "";
      for (const ch of word) {
        if (width(part + ch, size, bold) > max) { lines.push(part); part = ""; }
        part += ch;
      }
      line = part;
    };
    clean(text).split(" ").filter((w) => w !== "").forEach(put);
    if (line || !lines.length) lines.push(line);
    return lines;
  }
  const esc = (s) => s.replace(/[\\()]/g, (m) => "\\" + m);
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((x) => x.toFixed(3)).join(" "); };
  const num = (x) => (Math.round(x * 100) / 100).toString();

  function build(spec) {
    const PW = 595.28, PH = 841.89, M = 48, TOP = 56, BOTTOM = 56, MAXW = PW - 2 * M;
    const pages = [];    // { ops: [], links: [] }
    let page, y;
    const newPage = () => { page = { ops: [], links: [] }; pages.push(page); y = PH - TOP; };
    newPage();
    for (const b of spec.blocks) {
      if (b.cols) {
        const size = b.size || 9.5, lead = size * 1.35, gapX = 10;
        const room = MAXW - gapX * (b.cols.length - 1);
        // each field gets the room its text needs, and the room left over is shared; when the text does not fit in a row, the width is shared in proportion
        const need = b.cols.map((c) => width(clean(c.label) + " ", size, false) + width(clean(c.value), size, true) + 2), needTotal = need.reduce((s, n) => s + n, 0);
        const widths = need.map((n) => (needTotal <= room ? n + (room - needTotal) / need.length : room * n / needTotal));
        let x = M;
        const cells = b.cols.map((c, ci) => {
          const cwid = widths[ci], label = clean(c.label) + " ", lw = width(label, size, false);
          // the value starts after its label; when it does not fit it goes on under it
          const lines = [], one = clean(c.value);
          if (width(one, size, true) <= cwid - lw) lines.push(one);
          else { const l = wrap(c.value, size, true, cwid); l.forEach((s) => lines.push(s)); lines.wrapped = true; }
          const cell = { x, label, lw, lines, wrapped: !!lines.wrapped };
          x += cwid + gapX;
          return cell;
        });
        const rows = Math.max(...cells.map((c) => c.lines.length + (c.wrapped ? 1 : 0)));
        y -= b.gap || 0;
        if (y - lead * rows < BOTTOM) newPage();
        cells.forEach((c) => {
          let yy = y - lead;
          const base = (yy) => yy + (lead - size) / 2 + size * 0.2;
          page.ops.push("BT /F1 " + num(size) + " Tf " + rgb("#5B616B") + " rg " + num(c.x) + " " + num(base(yy)) + " Td (" + esc(c.label) + ") Tj ET");
          if (!c.wrapped) page.ops.push("BT /F2 " + num(size) + " Tf " + rgb("#1D1F23") + " rg " + num(c.x + c.lw) + " " + num(base(yy)) + " Td (" + esc(c.lines[0]) + ") Tj ET");
          else c.lines.forEach((s) => { yy -= lead; page.ops.push("BT /F2 " + num(size) + " Tf " + rgb("#1D1F23") + " rg " + num(c.x) + " " + num(base(yy)) + " Td (" + esc(s) + ") Tj ET"); });
        });
        y -= lead * rows;
        continue;
      }
      const size = b.size || 10, lead = size * 1.35, indent = b.indent || 0, bold = !!b.bold;
      const inner = MAXW - indent - (b.bar ? 10 : 0);
      const lines = wrap(b.text, size, bold, inner);
      y -= b.gap || 0;
      lines.forEach((ln, k) => {
        if (y - lead < BOTTOM) newPage();
        const top = y, bottom = y - lead;
        if (b.fill) page.ops.push(rgb(b.fill) + " rg " + num(M + indent) + " " + num(bottom) + " " + num(MAXW - indent) + " " + num(lead) + " re f");
        if (b.bar) page.ops.push(rgb(b.bar) + " rg " + num(M + indent) + " " + num(bottom) + " 3 " + num(lead) + " re f");
        const x = M + indent + (b.bar ? 10 : 0), base = bottom + (lead - size) / 2 + size * 0.2;
        page.ops.push("BT /" + (bold ? "F2" : "F1") + " " + num(size) + " Tf " + rgb(b.link ? "#0B5CAD" : b.color || "#1D1F23") + " rg " + num(x) + " " + num(base) + " Td (" + esc(ln) + ") Tj ET");
        if (b.link) {
          const w = width(ln, size, bold);
          page.ops.push(rgb("#0B5CAD") + " RG 0.6 w " + num(x) + " " + num(base - 1.5) + " m " + num(x + w) + " " + num(base - 1.5) + " l S");
          page.links.push({ rect: [x, base - 3, x + w, base + size], url: b.link });
        }
        y = bottom;
        if (k === lines.length - 1) y -= b.after || 0;
      });
    }
    // objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then per page: page, content, its links
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add(null);
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    pages.forEach((p, i) => {
      const foot = clean(String(spec.footer || "").replace("{n}", i + 1).replace("{m}", pages.length));
      p.ops.push("BT /F1 8 Tf " + rgb("#5B616B") + " rg " + num(M) + " 28 Td (" + esc(foot) + ") Tj ET");
      const stream = p.ops.join("\n");
      const pageId = objs.length + 1, contentId = pageId + 1;
      const annots = p.links.map((l, k) => contentId + 1 + k);
      kids.push(pageId);
      add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + num(PW) + " " + num(PH) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + contentId + " 0 R" +
        (annots.length ? " /Annots [" + annots.map((a) => a + " 0 R").join(" ") + "]" : "") + " >>");
      add("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
      p.links.forEach((l) => add("<< /Type /Annot /Subtype /Link /Rect [" + l.rect.map(num).join(" ") + "] /Border [0 0 0] /A << /S /URI /URI (" + esc(l.url) + ") >> >>"));
    });
    objs[1] = "<< /Type /Pages /Kids [" + kids.map((k) => k + " 0 R").join(" ") + "] /Count " + kids.length + " >>";
    const info = add("<< /Title (" + esc(clean(spec.title)) + ") /Producer (eDocument XML Viewer) >>");
    let out = "%PDF-1.4\n";
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
    const xref = out.length;
    out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    out += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }
  window.EdocPdf = { build, wrap, width };
})();
