import test from "node:test";
import assert from "node:assert/strict";
import { fmtDate, fmtDay, fmtRange, fmtSpan, fmtDateTime, fmtMonth, fmtMonthShort } from "../lib/dates.ts";

test("single dates read as words", () => {
  assert.equal(fmtDate("2026-12-12"), "12 Dec 2026");
  assert.equal(fmtDate("2026-01-05"), "5 Jan 2026");
  assert.equal(fmtDay("2026-12-12"), "Sat 12 Dec 2026");
  assert.equal(fmtDate(null), "");
});
test("ranges collapse the repeated parts", () => {
  assert.equal(fmtRange("2026-12-07", "2026-12-11"), "7–11 Dec 2026");
  assert.equal(fmtRange("2026-11-28", "2026-12-04"), "28 Nov – 4 Dec 2026");
  assert.equal(fmtRange("2026-12-28", "2027-01-02"), "28 Dec 2026 – 2 Jan 2027");
  assert.equal(fmtRange("2026-12-08", "2026-12-08"), "8 Dec 2026");
  assert.equal(fmtRange("2026-12-08", undefined), "8 Dec 2026");
});
test("open spans, timestamps and months", () => {
  assert.equal(fmtSpan("2026-01-01", null), "since 1 Jan 2026");
  assert.equal(fmtSpan("2026-01-01", "2026-06-30"), "1 Jan – 30 Jun 2026");
  assert.equal(fmtDateTime("2026-11-06 19:54:46"), "6 Nov 2026, 19:54");
  assert.equal(fmtMonth("2026-11"), "November 2026");
  assert.equal(fmtMonthShort("2026-11"), "Nov 2026");
});
