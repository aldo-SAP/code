/*
 * Where did each field go? The converters (request-to-ubl.js, request-document.js) read a field, then build the element with its value; FieldTrace notes the
 * reads, and the element that is built next with a value (or an attribute value) equal to a read one gets a marker comment that names the field. extract()
 * turns the markers into a list { field, value, xml } and returns the XML without them.
 */
(function () {
  "use strict";
  let pending = [];
  const enc = (list) => encodeURIComponent(JSON.stringify(list)).replace(/-/g, "%2D");
  const dec = (s) => JSON.parse(decodeURIComponent(s));
  const nameOf = (e) => e.nodeName.replace(/^(ubl|cn):/, "");

  function xmlPath(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
      const same = e.parentNode && e.parentNode.nodeType === 1 ? Array.from(e.parentNode.children).filter((c) => c.nodeName === e.nodeName) : [e];
      parts.unshift(nameOf(e) + (same.length > 1 ? "[" + (same.indexOf(e) + 1) + "]" : ""));
    }
    return parts.join("/");
  }

  window.FieldTrace = {
    reset() { pending = []; },
    read(path, value) { if (value !== undefined && value !== null && String(value) !== "") pending.push({ path, value: String(value) }); },
    // called by an element builder with the text and attributes it was given: the marker to put inside the element ("" when nothing matches)
    mark(text, attrs) {
      const out = [];
      const take = (val, attr) => {
        const i = pending.findIndex((r) => r.value === String(val));
        if (i >= 0) { out.push([pending[i].path, String(val), attr]); pending.splice(i, 1); }
      };
      if (text !== "" && text !== undefined && text !== null) take(text, "");
      Object.keys(attrs || {}).forEach((k) => { if (attrs[k] !== "" && attrs[k] !== undefined) take(attrs[k], k); });
      pending = [];
      return out.length ? "<!--@t:" + enc(out) + "-->" : "";
    },
    extract(xml) {
      const trace = [];
      try {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const it = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
        for (let n = it.nextNode(); n; n = it.nextNode()) {
          if (!n.nodeValue.startsWith("@t:")) continue;
          const where = xmlPath(n.parentNode);
          dec(n.nodeValue.slice(3)).forEach(([field, value, attr]) => trace.push({ field, value, xml: where + (attr ? "/@" + attr : "") }));
        }
      } catch (e) { /* no trace, the XML is still right */ }
      return { xml: xml.replace(/<!--@t:[^>]*?-->/g, ""), trace };
    }
  };
})();
