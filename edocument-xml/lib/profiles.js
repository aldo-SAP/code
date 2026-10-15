/*
 * Country profiles: what one country's format adds to the generic view.
 *
 * A profile is registered with EdocProfiles.register((h) => ({ … })), where h = { esc, txt, T } are the viewer's helpers, and has:
 *   id          short id ("ae")
 *   detect(R)   true when the document (its root element R) is in this format
 *   docFields   rows added at the end of the document fields   [path, label, BT, options]
 *   lineFields  rows added to the invoice line fields: [{ after: "path of an existing row", rows: [[path, label, BT, options], …] }]
 *   refLabels   rows of the references card shown with another label: { "path": [label, BT] }
 *   sample      { label, xml }: a button that loads an example of the format
 * Everything is optional. The rule sets are separate (rules/en16931.js: EN16931.register).
 */
(function () {
  "use strict";
  const factories = [];
  let list = null;
  const NONE = { id: "", docFields: [], lineFields: [], refLabels: {}, sample: null };

  window.EdocProfiles = {
    register: (factory) => { factories.push(factory); list = null; },
    all(h) { if (!list) list = factories.map((f) => Object.assign({}, NONE, f(h))); return list; },
    // the profile of a document (an empty one when no country's format is recognised)
    active(h, R) { return this.all(h).find((p) => p.detect && p.detect(R)) || NONE; },
    // spec with the profile's rows added: after the row named in `after`, or at the end
    addRows(spec, additions) {
      const out = spec.slice();
      additions.forEach((a) => {
        const at = out.findIndex((f) => f[0] === a.after);
        out.splice(at < 0 ? out.length : at + 1, 0, ...a.rows);
      });
      return out;
    },
    relabel(spec, labels) { return spec.map((f) => (labels[f[0]] ? [f[0], labels[f[0]][0], labels[f[0]][1]].concat(f.slice(3)) : f)); }
  };
})();
