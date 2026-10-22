/* Italy (FatturaPA): the example button. The checks are in rules/it-schema.js, it-spec.js and it-sdi.js, the view in view.js, the texts in it.js, the example in sample.js. */
EdocProfiles.register(function () {
  "use strict";
  return {
    id: "it",
    sample: window.IT_SAMPLE_XML ? { label: "Italy", title: "Try an Italian (FatturaPA) sample", file: "IT10203040506_00007.xml", xml: window.IT_SAMPLE_XML } : null
  };
});
