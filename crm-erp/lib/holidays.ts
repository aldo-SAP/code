import { all, get, run, tx } from "./db.ts";
import { audit, type Actor } from "./audit.ts";
import { fmtDate } from "./dates.ts";

/** Countries offered for public-holiday calendars (ISO 3166 alpha-2). Names come from the runtime's own country data. */
export const COUNTRY_CODES = ["AL", "XK", "MK", "ME", "RS", "BA", "HR", "SI", "IT", "DE", "FR", "ES", "PT", "GB", "IE", "NL", "BE", "LU", "AT", "CH", "GR", "BG", "RO", "HU", "CZ", "SK", "PL", "SE", "NO", "DK", "FI", "EE", "LV", "LT", "CY", "MT", "TR", "UA", "MD", "US", "CA", "MX", "BR", "AE", "IN", "EG", "MA", "TN"];

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const isWeekday = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w !== 0 && w !== 6; };

/** Working days between two dates, skipping weekends and the given public holidays. Pure. */
export function workingDaysWith(from: string, to: string, holidays: Map<string, string> | Set<string>): number {
  if (to < from) return 0;
  let n = 0;
  const d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10), w = d.getUTCDay();
    if (w !== 0 && w !== 6 && !holidays.has(iso)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export async function holidayCountryOf(personId: number): Promise<string | null> {
  return (await get<{ holiday_country: string | null }>("SELECT holiday_country FROM people WHERE id=?", personId))?.holiday_country ?? null;
}

/** Public holidays that apply to this person (by the country they follow) between two dates, as date -> name. */
export async function personHolidays(personId: number, from: string, to: string): Promise<Map<string, string>> {
  const rows = await all<{ day: string; name: string }>(
    "SELECT h.day, h.name FROM holidays h JOIN people p ON p.holiday_country=h.country WHERE p.id=? AND h.day BETWEEN ? AND ?", personId, from, to);
  return new Map(rows.map((r) => [r.day, r.name]));
}

export async function holidaysIn(country: string, year: number) {
  return all<{ day: string; name: string }>("SELECT day,name FROM holidays WHERE country=? AND day BETWEEN ? AND ? ORDER BY day", country, `${year}-01-01`, `${year}-12-31`);
}

/** Keep each leave row's stored working-day count in line with the calendar (after holidays or a person's country change). */
export async function recomputeLeaveDays(personIds: number[]) {
  for (const pid of personIds) {
    const rows = await all<{ id: number; from_date: string; to_date: string }>("SELECT id,from_date,to_date FROM leave WHERE person_id=?", pid);
    if (!rows.length) continue;
    const min = rows.reduce((a, r) => (r.from_date < a ? r.from_date : a), rows[0].from_date), max = rows.reduce((a, r) => (r.to_date > a ? r.to_date : a), rows[0].to_date);
    const hol = await personHolidays(pid, min, max);
    for (const r of rows) await run("UPDATE leave SET days=? WHERE id=?", workingDaysWith(r.from_date, r.to_date, hol), r.id);
  }
}
const peopleOf = async (country: string) => (await all<{ id: number }>("SELECT id FROM people WHERE holiday_country=?", country)).map((p) => p.id);

type Res<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const validCountry = (c: string) => /^[A-Z]{2}$/.test(c);

export async function addHoliday(actor: Actor, country: string, day: string, name: string): Promise<Res> {
  country = country.toUpperCase();
  if (!validCountry(country)) return { ok: false, error: "Choose a country." };
  if (!isDate(day)) return { ok: false, error: "Enter the date as YYYY-MM-DD." };
  if (name.trim().length < 2) return { ok: false, error: "Give the holiday a name." };
  await tx(async () => {
    await run("INSERT INTO holidays (country,day,name) VALUES (?,?,?) ON CONFLICT (country,day) DO UPDATE SET name=EXCLUDED.name", country, day, name.trim());
    await recomputeLeaveDays(await peopleOf(country));
    await audit(actor, "create", "holiday", null, `${countryName(country)}: ${fmtDate(day)} ${name.trim()}`);
  });
  return { ok: true };
}

export async function deleteHoliday(actor: Actor, country: string, day: string): Promise<Res> {
  await tx(async () => {
    const h = await get<{ name: string }>("SELECT name FROM holidays WHERE country=? AND day=?", country, day);
    if (!h) return;
    await run("DELETE FROM holidays WHERE country=? AND day=?", country, day);
    await recomputeLeaveDays(await peopleOf(country));
    await audit(actor, "delete", "holiday", null, `${countryName(country)}: removed ${fmtDate(day)} ${h.name}`);
  });
  return { ok: true };
}

/** Lines like "2026-04-06 Easter Monday" (also "06.04.2026" or "06/04/2026"). Nothing is saved if any line is wrong. */
export function parseHolidayLines(text: string): { rows: { day: string; name: string }[]; errors: string[] } {
  const rows: { day: string; name: string }[] = [], errors: string[] = [];
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})[\s,;:-]+(.+)$/);
    if (!m) { errors.push(`line ${i + 1}: expected "date name"`); return; }
    let day = m[1];
    const dm = day.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dm) day = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    if (!isDate(day)) { errors.push(`line ${i + 1}: "${m[1]}" is not a real date`); return; }
    rows.push({ day, name: m[2].trim() });
  });
  return { rows, errors };
}

export async function addHolidaysBulk(actor: Actor, country: string, text: string): Promise<Res<{ added: number }>> {
  country = country.toUpperCase();
  if (!validCountry(country)) return { ok: false, error: "Choose a country." };
  const { rows, errors } = parseHolidayLines(text);
  if (errors.length) return { ok: false, error: `Nothing was saved. ${errors.slice(0, 5).join("; ")}` };
  if (!rows.length) return { ok: false, error: "Paste at least one line like: 2026-12-25 Christmas Day" };
  await tx(async () => {
    for (const r of rows) await run("INSERT INTO holidays (country,day,name) VALUES (?,?,?) ON CONFLICT (country,day) DO UPDATE SET name=EXCLUDED.name", country, r.day, r.name);
    await recomputeLeaveDays(await peopleOf(country));
    await audit(actor, "import", "holiday", null, `${countryName(country)}: added ${rows.length} public holiday(s)`);
  });
  return { ok: true, added: rows.length };
}

/** Copies a year's entries to the next year on the same month and day. Right for fixed dates; moving ones (Easter, religious) must be fixed by hand. */
export async function copyHolidayYear(actor: Actor, country: string, fromYear: number, toYear: number): Promise<Res<{ copied: number }>> {
  country = country.toUpperCase();
  const src = await holidaysIn(country, fromYear);
  if (!src.length) return { ok: false, error: `${countryName(country)} has no holidays in ${fromYear} to copy.` };
  let copied = 0;
  await tx(async () => {
    for (const h of src) {
      const day = `${toYear}${h.day.slice(4)}`;
      if (!isDate(day)) continue;
      await run("INSERT INTO holidays (country,day,name) VALUES (?,?,?) ON CONFLICT DO NOTHING", country, day, h.name);
      copied++;
    }
    await recomputeLeaveDays(await peopleOf(country));
    await audit(actor, "import", "holiday", null, `${countryName(country)}: copied ${fromYear} to ${toYear} (${copied} dates)`);
  });
  return { ok: true, copied };
}

export async function setHolidayCountry(actor: Actor, personId: number, country: string | null): Promise<Res> {
  const c = country ? country.toUpperCase() : null;
  if (c && !validCountry(c)) return { ok: false, error: "Invalid country." };
  await tx(async () => {
    const before = await holidayCountryOf(personId);
    await run("UPDATE people SET holiday_country=? WHERE id=?", c, personId);
    await recomputeLeaveDays([personId]);
    if (before !== c) await audit(actor, "update", "person", personId, `Public holidays calendar: ${countryName(before) || "none"} to ${countryName(c) || "none"}`);
  });
  return { ok: true };
}
