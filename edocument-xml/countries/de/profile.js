/* XRechnung (Germany): the example button. The rules are in rules.js, the translations in messages.js, the example in sample.js. */
EdocProfiles.register(function () {
  "use strict";
  return {
    id: "de",
    detect: (R) => window.XRechnung && window.XRechnung.detect(R),
    sample: window.DE_SAMPLE_XML ? { label: "Try a German (XRechnung) sample", file: "sample-xrechnung.xml", xml: window.DE_SAMPLE_XML } : null
  };
});
