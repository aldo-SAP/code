import test from "node:test";
import assert from "node:assert/strict";
import { rateAt, priceEntries, weekdaysBetween, monthFraction, periodRange, toEur } from "../lib/billing.ts";

const rates = [
  { kind: "bill" as const, amount: 400, currency: "EUR", effective_from: "2026-01-01" },
  { kind: "bill" as const, amount: 450, currency: "EUR", effective_from: "2026-07-01" },
  { kind: "cost" as const, amount: 250, currency: "EUR", effective_from: "2026-01-01" },
];

test("rate is chosen by effective date", () => {
  assert.equal(rateAt(rates, "bill", "2026-06-30")?.amount, 400);
  assert.equal(rateAt(rates, "bill", "2026-07-01")?.amount, 450);
  assert.equal(rateAt(rates, "bill", "2025-12-31"), undefined);
  assert.equal(rateAt(rates, "cost", "2026-08-01")?.amount, 250);
});

test("daily rate: hours / 8 x rate, substitute hours roll into the assignee line", () => {
  const entries = [
    { work_date: "2026-10-01", hours: 8, worker_id: 1 },
    { work_date: "2026-10-02", hours: 8, worker_id: 1 },
    { work_date: "2026-10-05", hours: 8, worker_id: 2 }, // Y substitutes X
    { work_date: "2026-10-06", hours: 4, worker_id: 2 },
  ];
  const { lines, missing } = priceEntries("daily", 8, entries, (e) => rateAt(rates, "bill", e.work_date));
  assert.equal(missing.length, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 3.5);
  assert.equal(lines[0].amount, 1575); // October uses the 450 rate effective from July
  assert.deepEqual(lines[0].hours_by_worker, { 1: 16, 2: 12 });
});

test("rate change mid-month splits lines; hourly pricing", () => {
  const entries = [
    { work_date: "2026-06-30", hours: 8, worker_id: 1 },
    { work_date: "2026-07-01", hours: 8, worker_id: 1 },
  ];
  const daily = priceEntries("daily", 8, entries, (e) => rateAt(rates, "bill", e.work_date));
  assert.equal(daily.lines.length, 2);
  const hourly = priceEntries("hourly", 8, [{ work_date: "2026-07-01", hours: 7.5, worker_id: 1 }], () => ({ amount: 40, currency: "EUR" }));
  assert.equal(hourly.lines[0].amount, 300);
});

test("entries without a rate are reported, not silently dropped", () => {
  const { lines, missing } = priceEntries("daily", 8, [{ work_date: "2025-01-01", hours: 8, worker_id: 1 }], (e) => rateAt(rates, "bill", e.work_date));
  assert.equal(lines.length, 0);
  assert.equal(missing.length, 1);
});

test("calendar helpers", () => {
  assert.deepEqual(periodRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.equal(weekdaysBetween("2026-11-01", "2026-11-30"), 21);
  assert.equal(monthFraction("2026-01-01", null, "2026-11"), 1);
  assert.equal(monthFraction("2026-11-16", null, "2026-11"), 11 / 21);
  assert.equal(monthFraction("2026-01-01", "2026-10-31", "2026-11"), 0);
});

test("currency conversion", () => {
  assert.equal(toEur(100, "EUR", undefined), 100);
  assert.equal(toEur(100, "USD", 0.9), 90);
  assert.equal(toEur(100, "USD", undefined), undefined);
});
