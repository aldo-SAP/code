import Link from "next/link";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { saveTimesheet } from "@/app/actions";
import { Badge, Field, Flash, Hidden, thisMonth } from "@/components/ui";
import { periodRange } from "@/lib/billing";
import { personHolidays } from "@/lib/holidays";
import TimesheetFields, { type Cell } from "@/components/TimesheetFields";
import { fmtDate, fmtMonth, fmtMonthShort, fmtRange } from "@/lib/dates";

const shift = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); };

export default async function Timesheets({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; month?: string; person?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = can.manage(user);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const people = manager ? await all<any>("SELECT id,name FROM people WHERE stage IN ('ready','placed') ORDER BY name") : [];
  const pid = manager ? Number(sp.person ?? people[0]?.id ?? 0) : user.person_id;
  if (!pid) return <div className="card"><h1>Timesheet</h1><p className="muted">{manager ? "No people are ready to be placed yet." : "Your login is not linked to a person record. Ask an admin."}</p></div>;
  const person = await get<any>("SELECT * FROM people WHERE id=?", pid);
  const { start, end } = periodRange(month);
  const days = Array.from({ length: Number(end.slice(8)) }, (_, k) => `${month}-${String(k + 1).padStart(2, "0")}`);

  const rows = await all<any>(`
    SELECT a.id, a.start_date, a.end_date, a.person_id AS owner_id, pr.name AS project, owner.name AS owner, a.hours_per_day, a.billing_type
    FROM assignments a JOIN projects pr ON pr.id=a.project_id JOIN people owner ON owner.id=a.person_id
    WHERE a.billing_type IN ('hourly','daily') AND (a.person_id=? OR a.id IN (SELECT assignment_id FROM substitutions WHERE person_id=? AND to_date>=? AND from_date<=?))
      AND a.start_date<=? AND (a.end_date IS NULL OR a.end_date>=?) ORDER BY pr.name`, pid, pid, start, end, end, start);
  const subs = await all<any>("SELECT assignment_id,from_date,to_date FROM substitutions WHERE person_id=?", pid);
  const covering = await all<any>(
    `SELECT sb.from_date, sb.to_date, pr.name AS project, o.name AS owner FROM substitutions sb JOIN assignments a ON a.id=sb.assignment_id
     JOIN projects pr ON pr.id=a.project_id JOIN people o ON o.id=a.person_id WHERE sb.person_id=? AND sb.from_date<=? AND sb.to_date>=?`, pid, end, start);
  const entries = new Map((await all<any>(`SELECT assignment_id,work_date,hours,status,invoice_id,payout_id FROM timesheet_entries WHERE worker_id=? AND work_date BETWEEN ? AND ?`, pid, start, end)).map((e) => [`${e.assignment_id}_${fmtDate(e.work_date)}`, e]));
  const leave = await all<any>("SELECT * FROM leave WHERE person_id=? AND status IN ('requested','approved') AND to_date>=? AND from_date<=? ORDER BY from_date", pid, start, end);
  const holidays = await personHolidays(pid, start, end);
  const onLeave = (d: string) => leave.some((l) => l.status === "approved" && l.from_date <= d && d <= l.to_date);
  const allowed = (r: any, d: string) =>
    (r.owner_id === pid && d >= r.start_date && (!r.end_date || d <= r.end_date)) || subs.some((s) => s.assignment_id === r.id && s.from_date <= d && d <= s.to_date);
  const q = (m: string) => `/timesheets?month=${m}${manager ? `&person=${pid}` : ""}`;
  const statuses = [...entries.values()].map((e) => e.status);
  const pending = statuses.filter((s) => s === "draft" || s === "rejected").length;
  const back = q(month);
  const billedCount = [...entries.values()].filter((e) => e.invoice_id != null || e.payout_id != null).length;

  return (
    <>
      <h1>Timesheet {fmtMonth(month)}</h1><Flash sp={sp} />
      <div className="bar">
        {manager && <form className="row"><input type="hidden" name="month" value={month} />
          <Field label="Person"><select name="person" defaultValue={pid}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><button className="sec">Show</button></form>}
        <div className="monthnav">
          <Link className="btn sec" href={q(shift(month, -1))}>&larr; {fmtMonthShort(shift(month, -1))}</Link>
          <Link className="btn sec" href={q(shift(month, 1))}>{fmtMonthShort(shift(month, 1))} &rarr;</Link>
        </div>
        <span className="muted">{person.name}: enter hours per day. Yellow = submitted, green = approved, red = rejected, orange = leave, hatched = public holiday.</span>
      </div>
      {covering.map((c, k) => <div className="flash err" key={k} style={{ background: "var(--warnbg)", color: "var(--warn)" }}><b>{person.name} is covering for {c.owner}</b> on {c.project} on {fmtRange(c.from_date, c.to_date)}. Hours entered on those days are {person.name}'s own hours: the client invoice shows {c.owner} only, and {person.name} is paid at the substitute rate.</div>)}
      {billedCount > 0 && <div className="flash err">{billedCount} day(s) this month are already invoiced or paid out (dashed cells) and locked. {manager ? <Link href={`/unlock?person=${pid}&month=${month}`}>Unlock billed hours</Link> : "Ask a manager if something must be corrected."}</div>}
      {!rows.length ? <div className="card muted">No assignments or substitutions in this month.</div> : (
        <form action={saveTimesheet}>
          <Hidden name="month" value={month} /><Hidden name="person_id" value={pid} />
          <TimesheetFields days={days} rows={rows.map((r) => {
            const cells: Record<string, Cell> = {};
            let total = 0;
            for (const d of days) {
              const e = entries.get(`${r.id}_${d}`);
              if (e) total += e.hours;
              const isBilled = !!e && (e.invoice_id != null || e.payout_id != null);
              const locked = !!e && (e.status === "approved" || isBilled || (e.status === "submitted" && !manager));
              cells[d] = { v: e ? String(e.hours) : "", status: e?.status ?? "", disabled: !allowed(r, d) || locked, billed: isBilled, leave: onLeave(d), holiday: holidays.get(d), weekend: [0, 6].includes(new Date(d).getUTCDay()) };
            }
            return { id: r.id, project: r.project, substituting: r.owner_id !== pid ? r.owner : undefined, cells, total };
          })} />
          <div className="bar ts-actions" style={{ marginTop: 12 }}>
            <button name="intent" value="save" className="sec">Save draft</button>
            <button name="intent" value="submit" data-confirm="Submit this month for approval? Submitted days are locked until a manager approves or rejects them.">Submit month for approval{pending ? ` (${pending} day(s) pending)` : ""}</button>
            <span className="muted">Submitted days are locked until a manager approves or rejects them.</span>
          </div>
        </form>
      )}
      <h2>Leave</h2>
      <table><tbody>{leave.map((l) => <tr key={l.id}><td>{l.type}</td><td>{fmtRange(l.from_date, l.to_date)}</td><td><Badge v={l.status} /></td></tr>)}
        {!leave.length && <tr><td className="muted">No leave this month. Leave is not billable.</td></tr>}</tbody></table>
      <p><Link href="/leave">Request or manage leave</Link></p>
    </>
  );
}
