import { all } from "./db.ts";
import { periodRange } from "./billing.ts";
import { personHolidays } from "./holidays.ts";
import { fmtRange } from "./dates.ts";

/** A normal working day is 8 hours. People may enter more or less; this is the yardstick. */
export const DAY_HOURS = 8;

const isWeekday = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w !== 0 && w !== 6; };
const addDay = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export interface Expected { days: number; hours: number; perDay: number }

/** Weekdays of the month that are on an assignment (own or as a substitute), not a public holiday and not approved leave. */
export function countExpected(days: string[], ranges: { from: string; to: string | null }[], holidays: Set<string>, leave: { from: string; to: string }[], perDay = DAY_HOURS): Expected {
  const n = days.filter((d) => isWeekday(d) && !holidays.has(d) && !leave.some((l) => l.from <= d && d <= l.to) && ranges.some((r) => r.from <= d && (!r.to || d <= r.to))).length;
  return { days: n, hours: n * perDay, perDay };
}

export async function expectedHours(personId: number, month: string): Promise<Expected> {
  const { start, end } = periodRange(month);
  const days = Array.from({ length: Number(end.slice(8)) }, (_, k) => `${month}-${String(k + 1).padStart(2, "0")}`);
  const own = await all<{ s: string; e: string | null }>("SELECT start_date AS s, end_date AS e FROM assignments WHERE person_id=? AND billing_type IN ('hourly','daily') AND start_date<=? AND (end_date IS NULL OR end_date>=?)", personId, end, start);
  const subs = await all<{ s: string; e: string }>("SELECT from_date AS s, to_date AS e FROM substitutions WHERE person_id=? AND from_date<=? AND to_date>=?", personId, end, start);
  const leave = await all<{ s: string; e: string }>("SELECT from_date AS s, to_date AS e FROM leave WHERE person_id=? AND status='approved' AND from_date<=? AND to_date>=?", personId, end, start);
  const hol = new Set((await personHolidays(personId, start, end)).keys());
  return countExpected(days, [...own.map((r) => ({ from: r.s, to: r.e })), ...subs.map((r) => ({ from: r.s, to: r.e }))], hol, leave.map((l) => ({ from: l.s, to: l.e })));
}

/** "3–6 Nov 2026: 8 h" lines. Consecutive working days with the same hours become one line, so a month reads in a few lines. */
export function dayLines(entries: { date: string; hours: number }[]): [string, string][] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: { from: string; to: string; hours: number }[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    if (last && last.hours === e.hours) {
      let nx = addDay(last.to, 1);
      while (nx < e.date && !isWeekday(nx)) nx = addDay(nx, 1);
      if (nx === e.date) { last.to = e.date; continue; }
    }
    out.push({ from: e.date, to: e.date, hours: e.hours });
  }
  const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, "")} h`;
  return out.map((r) => [fmtRange(r.from, r.to), h(r.hours)]);
}
