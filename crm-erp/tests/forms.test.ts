import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; });

// React reads form.id when it adds the clicked button's name/value to the submission. A field named "id"
// shadows that property and the button's value silently disappears. Use another name (we use "rid").
test("no form field is named id", () => {
  const offenders = [...walk("app"), ...walk("components")].filter((f) => /name="id"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
