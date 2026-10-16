/* Plain-language "how to fix" lines for the rules, in English and Italian. Rule files add theirs with EdocHelp.add({ id: [english, italian] });
   the Checks list shows the line under every rule that fails. */
(function () {
  const H = {};
  window.EdocHelp = {
    add(map) { Object.assign(H, map); },
    // the line for a rule id in the current language, or ""
    get(id) { const h = H[id]; return h ? (window.I18N && I18N.lang === "it" ? h[1] || h[0] : h[0]) : ""; },
    count: () => Object.keys(H).length
  };
})();
