import test from "node:test";
import assert from "node:assert/strict";
import { countExpected, dayLines } from "../lib/expected.ts";

const days = (m: string, n: number) => Array.from({ length: n }, (_, k) => `${m}-${String(k + 1).padStart(2, "0")}`);

test("expected hours: weekdays on an assignment, minus holidays and approved leave, 8 h each", () => {
  const nov = days("2026-11", 30);                                       // 21 weekdays
  assert.deepEqual(countExpected(nov, [{ from: "2026-01-01", to: null }], new Set(), []), { days: 21, hours: 168, perDay: 8 });
  assert.equal(countExpected(nov, [{ from: "2026-01-01", to: null }], new Set(["2026-11-02"]), [{ from: "2026-11-09", to: "2026-11-13" }]).hours, (21 - 1 - 5) * 8);
  assert.equal(countExpected(nov, [{ from: "2026-11-16", to: null }], new Set(), []).days, 11);        // starts mid-month
  assert.equal(countExpected(nov, [{ from: "2026-01-01", to: "2026-11-06" }], new Set(), []).days, 5);  // ends early
  assert.equal(countExpected(nov, [], new Set(), []).hours, 0);                                        // not placed: nothing expected
});

test("day lines: runs of equal hours become one readable line, weekends do not break a run", () => {
  const lines = dayLines([
    { date: "2026-11-02", hours: 8 }, { date: "2026-11-03", hours: 8 }, { date: "2026-11-04", hours: 5 },
    { date: "2026-11-05", hours: 8 }, { date: "2026-11-06", hours: 8 }, { date: "2026-11-09", hours: 8 },
  ]);
  assert.deepEqual(lines.map((l) => l[1]), ["8 h", "5 h", "8 h"]);
  assert.equal(lines[0][0], "Mon 2 – Tue 3");
  assert.equal(lines[1][0], "Wed 4");
  assert.equal(lines[2][0], "Thu 5 – Mon 9");                          // Thu, Fri and the next Monday are one run
});
