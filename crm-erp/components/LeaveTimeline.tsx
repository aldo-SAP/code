import Link from "next/link";
import { leaveTimeline } from "@/lib/leave";
import { countryName, holidayCountryOf, personHolidays } from "@/lib/holidays";
import { Badge, num } from "@/components/ui";
import { fmtDate, fmtRange } from "@/lib/dates";

const doy = (d: string) => Math.floor((Date.parse(d + "T00:00:00Z") - Date.parse(d.slice(0, 4) + "-01-01T00:00:00Z")) / 86400000);
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Year view for one person: remaining days, a timeline of when leave was taken or is planned, and the history list. */
export default async function LeaveTimeline({ personId, year, basePath }: { personId: number; year: number; basePath: string }) {
  const { rows, balance: b } = await leaveTimeline(personId, year);
  const hol = await personHolidays(personId, `${year}-01-01`, `${year}-12-31`);
  const country = await holidayCountryOf(personId);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const total = leap ? 366 : 365;
  const today = new Date().toISOString().slice(0, 10);
  const shown = rows.filter((r) => r.status === "approved" || r.status === "requested");
  const pos = (from: string, to: string) => {
    const a = from < `${year}-01-01` ? 0 : doy(from), z = to > `${year}-12-31` ? total - 1 : doy(to);
    return { left: `${(a / total) * 100}%`, width: `${((z - a + 1) / total) * 100}%` };
  };
  const monthStarts = Array.from({ length: 11 }, (_, k) => doy(`${year}-${String(k + 2).padStart(2, "0")}-01`));
  const join = basePath.includes("?") ? "&" : "?";
  return (
    <section aria-label={`Leave ${year}`}>
      <div className="bar" style={{ marginBottom: 8 }}>
        <Link className="btn sec" href={`${basePath}${join}year=${year - 1}`}>&larr; {year - 1}</Link>
        <b style={{ fontSize: 16 }}>{year}</b>
        <Link className="btn sec" href={`${basePath}${join}year=${year + 1}`}>{year + 1} &rarr;</Link>
      </div>
      <div className="tiles">
        <div className="tile big"><b>{num(b.remaining)}</b><span>days left this year</span></div>
        <div className="tile"><b>{num(b.allowance)}</b><span>allowance</span></div>
        <div className="tile"><b>{num(b.taken)}</b><span>taken so far</span></div>
        <div className="tile"><b>{num(b.planned)}</b><span>planned (approved)</span></div>
        <div className="tile"><b>{num(b.pending)}</b><span>waiting for approval</span></div>
      </div>
      {b.pending > 0 && <p className="muted" style={{ marginTop: 0 }}>If everything waiting is approved, {num(b.remainingIfPending)} day{b.remainingIfPending === 1 ? "" : "s"} will be left.</p>}
      <div className="tl" role="img" aria-label={`Leave timeline ${year}: ${shown.length} period${shown.length === 1 ? "" : "s"}`}>
        {monthStarts.map((d) => <i key={d} style={{ left: `${(d / total) * 100}%` }} />)}
        {[...hol].map(([d, n]) => <u key={d} style={{ left: `${(doy(d) / total) * 100}%` }} title={`${d} ${n}`} />)}
        {shown.map((r) => <em key={r.id} className={r.status === "requested" ? "requested" : r.type} style={pos(r.from_date, r.to_date)} title={`${r.type} ${fmtDate(r.from_date)} to ${fmtDate(r.to_date)} (${r.status})`} />)}
        {today.startsWith(String(year)) && <span className="now" style={{ left: `${(doy(today) / total) * 100}%` }} title="today" />}
      </div>
      <div className="tl-months" aria-hidden="true">{MONTHS.map((m, k) => <span key={k}>{m}</span>)}</div>
      <div className="legend">
        <span style={{ ["--c" as string]: "var(--ok)" }}>Vacation</span><span style={{ ["--c" as string]: "var(--warn)" }}>Waiting for approval</span>
        <span style={{ ["--c" as string]: "var(--err)" }}>Sick</span><span style={{ ["--c" as string]: "var(--muted)" }}>Public holiday</span><span style={{ ["--c" as string]: "var(--brand)" }}>Other</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{country ? `Public holidays follow ${countryName(country)} (${hol.size} in ${year}, shown as small marks). They are not counted as vacation days.` : "No public-holiday calendar is set for this person, so every weekday counts. An admin can set it on the person page."}</p>
      <div className="tw"><table><thead><tr><th>When</th><th>Type</th><th className="num">Days</th><th>Status</th><th>Decision</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} style={r.status === "rejected" || r.status === "revoked" || r.status === "cancelled" ? { opacity: 0.7 } : undefined}>
            <td style={{ whiteSpace: "nowrap" }}><Link href={`/leave/${r.id}`}>{fmtRange(r.from_date, r.to_date)}</Link></td><td>{r.type}</td><td className="num">{r.days}</td><td><Badge v={r.status} /></td>
            <td className="muted">{r.requested_by_name && r.requested_by_person !== r.person_id && r.status !== "rejected" ? <>Recorded by {r.requested_by_name}{r.requested_at ? `, ${fmtDate(r.requested_at)}` : ""}{r.notes ? ` (${r.notes})` : ""}<br /></> : null}{r.decided_by_name && !(r.requested_by_name && r.requested_by_person !== r.person_id && r.decided_by === r.requested_by) ? `${r.decided_by_name}${r.decided_at ? ", " + fmtDate(r.decided_at) : ""}${r.decision_note ? `: ${r.decision_note}` : ""}` : ""}</td>
          </tr>))}
        {!rows.length && <tr><td colSpan={5} className="muted">No leave in {year}.</td></tr>}</tbody></table></div>
    </section>
  );
}
