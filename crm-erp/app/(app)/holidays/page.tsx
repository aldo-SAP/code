import Link from "next/link";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { COUNTRY_CODES, countryName, holidaysIn } from "@/lib/holidays";
import { addHolidayAction, addHolidaysBulkAction, copyHolidayYearAction, deleteHolidayAction } from "@/app/actions";
import { Field, Flash, Hidden } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import PageHead from "@/components/PageHead";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Holidays({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; country?: string; year?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : new Date().getFullYear();
  const summary = await all<any>(
    `SELECT c.country, (SELECT COUNT(*) FROM holidays h WHERE h.country=c.country AND h.day BETWEEN ? AND ?) AS entries,
            (SELECT COUNT(*) FROM people p WHERE p.holiday_country=c.country) AS people
     FROM (SELECT country FROM holidays UNION SELECT holiday_country FROM people WHERE holiday_country IS NOT NULL) c ORDER BY 1`, `${year}-01-01`, `${year}-12-31`);
  const country = (sp.country ?? summary[0]?.country ?? "IT").toUpperCase();
  const rows = await holidaysIn(country, year);
  const followers = await all<any>("SELECT id,name,country FROM people WHERE holiday_country=? ORDER BY name", country);
  const back = `/holidays?country=${country}&year=${year}`;
  return (
    <>
      <PageHead title="Public holidays" sub="One calendar per country. Each person follows the calendar set on their page." /><Flash sp={sp} />
      <p className="muted">One calendar per country. Each person follows the calendar set in <b>Public holidays follow</b> on their person page (this can differ from where they live). Those days are not counted as vacation, are marked on timesheets and timelines, and counting updates automatically when you change a calendar.</p>

      <form className="row card">
        <Field label="Country"><select name="country" defaultValue={country}>{COUNTRY_CODES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</select></Field>
        <Field label="Year"><input name="year" type="number" min="2000" max="2100" defaultValue={year} style={{ width: 100 }} /></Field>
        <button className="sec">Show</button>
        <span className="muted">Calendars in use: {summary.length ? summary.map((c, k) => <span key={c.country}>{k > 0 && ", "}<Link href={`/holidays?country=${c.country}&year=${year}`}>{countryName(c.country)}</Link> ({c.entries} in {year}, {c.people} people)</span>) : "none yet"}</span>
      </form>

      <h2>{countryName(country)} {year}: {rows.length} day{rows.length === 1 ? "" : "s"}</h2>
      <div className="tw"><table><thead><tr><th>Date</th><th></th><th>Holiday</th><th></th></tr></thead><tbody>
        {rows.map((h) => (
          <tr key={h.day}><td style={{ whiteSpace: "nowrap" }}>{fmtDate(h.day)}</td><td className="muted">{WD[new Date(h.day + "T00:00:00Z").getUTCDay()]}</td><td>{h.name}</td>
            <td><form action={deleteHolidayAction}><Hidden name="country" value={country} /><Hidden name="day" value={h.day} /><Hidden name="_back" value={back} /><button className="danger sm">Remove</button></form></td></tr>))}
        {!rows.length && <tr><td colSpan={4} className="muted">No public holidays entered for {countryName(country)} in {year} yet.</td></tr>}</tbody></table></div>
      <p className="muted">{followers.length ? <>Following this calendar: {followers.map((p, k) => <span key={p.id}>{k > 0 && ", "}<Link href={`/people/${p.id}`}>{p.name}</Link>{p.country && p.country !== countryName(country) ? ` (lives in ${p.country})` : ""}</span>)}.</> : "Nobody follows this calendar yet. Set it on a person's page."}</p>

      <h2>Add one day</h2>
      <form action={addHolidayAction} className="row card">
        <Hidden name="country" value={country} /><Hidden name="_back" value={back} />
        <Field label="Date" full><input type="date" name="day" required defaultValue={`${year}-01-01`} /></Field>
        <Field label="Name"><input name="name" required placeholder="Easter Monday" style={{ width: 260 }} /></Field>
        <button>Add to {countryName(country)}</button>
      </form>

      <h2>Paste a whole year</h2>
      <form action={addHolidaysBulkAction} className="card" style={{ display: "grid", gap: 8 }}>
        <Hidden name="country" value={country} /><Hidden name="_back" value={back} />
        <span className="muted">One per line: date, then name. Dates as 2026-12-25 or 25.12.2026. Existing dates are updated. If any line is wrong nothing is saved.</span>
        <textarea name="lines" aria-label="Public holidays, one per line: date then name" rows={8} placeholder={`${year}-01-01 New Year's Day\n${year}-04-06 Easter Monday\n25.12.${year} Christmas Day`} />
        <div><button>Save these days for {countryName(country)}</button></div>
      </form>

      <form action={copyHolidayYearAction} className="row card" style={{ marginTop: 12 }}>
        <Hidden name="country" value={country} /><Hidden name="year" value={year} /><Hidden name="_back" value={back} />
        <button className="sec">Copy {year - 1} into {year}</button>
        <span className="muted">Keeps the same month and day. Good for fixed dates; fix Easter and religious holidays by hand afterwards.</span>
      </form>
    </>
  );
}
