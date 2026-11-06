#!/bin/bash
# The quick checks to run before a push: no downloads, a minute or so. They do not replace ./run.sh par (the comparison with the official validators), which is the one
# to run after a change to the rules or the engine.
#   check.sh        all of them; the exit code is 0 only when every step passes
cd "$(dirname "$0")" || exit 2
fail=0
step() { # label command…
  local label="$1"; shift
  if out=$("$@" 2>&1); then echo "ok    $label"; else echo "FAIL  $label"; echo "$out" | tail -n 12 | sed 's/^/        /'; fail=1; fi
}
step "service worker is current (gen-sw.js)"      bash -c 'node gen-sw.js >/dev/null && node check-offline.js'
step "help lines belong to rules"                  node check-help.js
step "every rule message is translated"            node check-all-translations.js
step "examples pass their rules (check-samples)"   node check-samples.js
step "e-report: details in a header extension"  node check-ereport-ext.js
step "Italy: the example passes every layer"       node it/check-sample.js
step "Italy: specification rules"                  node it/check-spec.js
step "Italy: SdI controls"                         node it/check-sdi.js
for k in a b; do
  if [ -f ".cache/it-verdicts-$k.json" ]; then step "Italy: structure check agrees with libxml2 ($k)" node it/differential.js ".cache/it-verdicts-$k.json"; fi
done
step "converter agrees with the platform's results" node converter/run.js
step "request structure check"                     node converter/structure.js
step "what to change in the request"               node converter/fixes.js
[ $fail = 0 ] && echo "ALL CHECKS PASS" || echo "SOME CHECKS FAILED"
exit $fail
