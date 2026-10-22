/* France: the example button. The rules are in rules.js, the translations in messages.js, the example in sample.js. */
EdocProfiles.register(function () {
  "use strict";
  return {
    id: "fr",
    sample: window.FR_SAMPLE_XML ? { label: "France", title: "Try a French sample", file: "sample-facture-fr.xml", xml: window.FR_SAMPLE_XML } : null
  };
});
