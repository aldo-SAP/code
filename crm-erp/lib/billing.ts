// Pure billing maths: no database access, fully unit-testable.

export type BillingType = "hourly" | "daily" | "fixed" | "monthly";
export type RateKind = "bill" | "cost";

export interface Rate {
  kind: RateKind;
  amount: number;
  currency: string;
  effective_from: string; // YYYY-MM-DD
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The rate valid on `date`: the latest one whose effective_from is on/before it. */
export function rateAt(rates: Rate[], kind: RateKind, date: string): Rate | undefined {
  let best: Rate | undefined;
  for (const r of rates) {
    if (r.kind !== kind || r.effective_from > date) continue;
    if (!best || r.effective_from >= best.effective_from) best = r;
  }
  return best;
}

export function periodRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function weekdaysBetween(from: string, to: string): number {
  if (to < from) return 0;
  let n = 0;
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Share of a month (by weekdays) covered by an assignment, for monthly fees. */
export function monthFraction(start: string, end: string | null, period: string): number {
  const r = periodRange(period);
  const from = start > r.start ? start : r.start;
  const to = end && end < r.end ? end : r.end;
  const total = weekdaysBetween(r.start, r.end);
  return total === 0 ? 0 : weekdaysBetween(from, to) / total;
}

export interface EntryInput {
  id?: number;
  work_date: string;
  hours: number;
  worker_id: number;
}

export interface PricedLine {
  month: string; // YYYY-MM of the work date
  unit: "h" | "day";
  unit_price: number;
  currency: string;
  quantity: number;
  amount: number;
  hours_by_worker: Record<number, number>;
}

/**
 * Prices timesheet entries of one assignment.
 * - hourly: hours x rate
 * - daily:  hours / hours_per_day x daily rate
 * `rateFor` returns the applicable rate for the entry (bill rate of the
 * assignment, or the cost rate of whoever did the work).
 * Entries with no rate are returned in `missing`.
 */
export function priceEntries(
  billingType: BillingType,
  hoursPerDay: number,
  entries: EntryInput[],
  rateFor: (e: EntryInput) => { amount: number; currency: string } | undefined,
): { lines: PricedLine[]; missing: EntryInput[] } {
  const groups = new Map<string, PricedLine>();
  const missing: EntryInput[] = [];
  if (billingType !== "hourly" && billingType !== "daily") return { lines: [], missing };
  for (const e of entries) {
    const rate = rateFor(e);
    if (!rate) {
      missing.push(e);
      continue;
    }
    const month = e.work_date.slice(0, 7);
    const key = `${month}|${rate.amount}|${rate.currency}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        month,
        unit: billingType === "hourly" ? "h" : "day",
        unit_price: rate.amount,
        currency: rate.currency,
        quantity: 0,
        amount: 0,
        hours_by_worker: {},
      };
      groups.set(key, g);
    }
    g.quantity += billingType === "hourly" ? e.hours : e.hours / hoursPerDay;
    g.hours_by_worker[e.worker_id] = (g.hours_by_worker[e.worker_id] ?? 0) + e.hours;
  }
  const lines = [...groups.values()].sort((a, b) => a.month.localeCompare(b.month) || a.unit_price - b.unit_price);
  for (const l of lines) {
    l.quantity = Math.round(l.quantity * 10000) / 10000;
    l.amount = round2(l.quantity * l.unit_price);
  }
  return { lines, missing };
}

export function toEur(amount: number, currency: string, rateToEur: number | undefined): number | undefined {
  if (currency === "EUR") return amount;
  return rateToEur === undefined ? undefined : round2(amount * rateToEur);
}
