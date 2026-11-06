import Link from "next/link";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { addLeave, deleteLeave, saveTimesheet } from "@/app/actions";
import { Field, Flash, Hidden, thisMonth } from "@/components/ui";
import { periodRange } from "@/lib/billing";

const shift = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); };

export default async function Timesheets({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; month?: string; person?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = can.manage(user);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const people = manager ? all<any>("SELECT id,name FROM people WHERE stage IN ('ready','placed') ORDER BY name") : [];
  const pid = manager ? Number(sp.person ?? people[0]?.id ?? 0) : user.person_id;
  if (!pid) return <div className="card"><h2>Timesheet</h2><p className="muted">{manager ? "No people are ready to be placed yet." : "Your login is not linked to a person record. Ask an admin."}</p></div>;
  const person = get<any>("SELECT * FROM people WHERE id=?", pid);
  const { start, end } = periodRange(month);
  const days = Array.from({ length: Number(end.slice(8)) }, (_, k) => `${month}-${String(k + 1).padStart(2, "0")}`);

  const rows = all<any>(`
    SELECT a.id, a.start_date, a.end_date, a.person_id AS owner_id, pr.name AS project, owner.name AS owner, a.hours_per_day, a.billing_type
    FROM assignments a JOIN projects pr ON pr.id=a.project_id JOIN people owner ON owner.id=a.person_id
    WHERE a.billing_type IN ('hourly','daily') AND (a.person_id=? OR a.id IN (SELECT assignment_id FROM substitutions WHERE person_id=? AND to_date>=? AND from_date<=?))
      AND a.start_date<=? AND (a.end_date IS NULL OR a.end_date>=?) ORDER BY pr.name`, pid, pid, start, end, end, start);
  const subs = all<any>("SELECT assignment_id,from_date,to_date FROM substitutions WHERE person_id=?", pid);
  const entries = new Map(all<any>(`SELECT assignment_id,work_date,hours,status FROM timesheet_entries WHERE worker_id=? AND work_date BETWEEN ? AND ?`, pid, start, end).map((e) => [`${e.assignment_id}_${e.work_date}`, e]));
  const leave = all<any>("SELECT * FROM leave WHERE person_id=? AND to_date>=? AND from_date<=? ORDER BY from_date", pid, start, end);
  const onLeave = (d: string) => leave.some((l) => l.from_date <= d && d <= l.to_date);
  const allowed = (r: any, d: string) =>
    (r.owner_id === pid && d >= r.start_date && (!r.end_date || d <= r.end_date)) || subs.some((s) => s.assignment_id === r.id && s.from_date <= d && d <= s.to_date);
  const q = (m: string) => `/timesheets?month=${m}${manager ? `&person=${pid}` : ""}`;
  const statuses = [...entries.values()].map((e) => e.status);
  const pending = statuses.filter((s) => s === "draft" || s === "rejected").length;
  const back = q(month);

  return (
    <>
      <h2>Timesheet {month}</h2><Flash sp={sp} />
      <div className="bar">
        {manager && <form className="row"><input type="hidden" name="month" value={month} />
          <Field label="Person"><select name="person" defaultValue={pid}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><button className="sec">Show</button></form>}
        <Link className="btn sec" href={q(shift(month, -1))}>&larr; {shift(month, -1)}</Link>
        <Link className="btn sec" href={q(shift(month, 1))}>{shift(month, 1)} &rarr;</Link>
        <span className="muted">{person.name}: enter hours per day. Yellow = submitted, green = approved, red = rejected, shaded = leave.</span>
      </div>
      {!rows.length ? <div className="card muted">No assignments or substitutions in this month.</div> : (
        <form action={saveTimesheet}>
          <Hidden name="month" value={month} /><Hidden name="person_id" value={pid} />
          <div className="tw"><table className="ts">
            <thead><tr><th style={{ textAlign: "left" }}>Assignment</th>{days.map((d) => <th key={d} className={[0, 6].includes(new Date(d).getUTCDay()) ? "we" : ""}>{Number(d.slice(8))}</th>)}<th>Total</th></tr></thead>
            <tbody>{rows.map((r) => {
              let total = 0;
              return (
                <tr key={r.id}>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{r.project}{r.owner_id !== pid && <><br /><span className="muted">substituting {r.owner}</span></>}</td>
                  {days.map((d) => {
                    const e = entries.get(`${r.id}_${d}`);
                    if (e) total += e.hours;
                    const ok = allowed(r, d);
                    const locked = e && (e.status === "approved" || (e.status === "submitted" && !manager));
                    const wk = [0, 6].includes(new Date(d).getUTCDay());
                    return <td key={d} className={onLeave(d) ? "lv" : wk ? "we" : ""}>
                      <input name={`h_${r.id}_${d}`} defaultValue={e?.hours ?? ""} disabled={!ok || !!locked} className={e?.status ?? ""} inputMode="decimal" aria-label={`${r.project} ${d}`} /></td>;
                  })}
                  <td className="num"><b>{total}</b></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="bar" style={{ marginTop: 12 }}>
            <button name="intent" value="save" className="sec">Save draft</button>
            <button name="intent" value="submit">Submit month for approval{pending ? ` (${pending} day(s) pending)` : ""}</button>
            <span className="muted">Submitted days are locked until a manager approves or rejects them.</span>
          </div>
        </form>
      )}
      <h3>Leave</h3>
      <table><tbody>{leave.map((l) => <tr key={l.id}><td>{l.type}</td><td>{l.from_date} to {l.to_date}</td><td>{l.notes}</td>
        <td><form action={deleteLeave}><Hidden name="id" value={l.id} /><Hidden name="_back" value={back} /><button className="danger sm">Remove</button></form></td></tr>)}
        {!leave.length && <tr><td className="muted">No leave this month. Leave is not billable.</td></tr>}</tbody></table>
      <form action={addLeave} className="row" style={{ marginTop: 8 }}>
        <Hidden name="person_id" value={pid} /><Hidden name="_back" value={back} />
        <Field label="Type"><select name="type"><option>vacation</option><option>sick</option><option>holiday</option><option>other</option></select></Field>
        <Field label="From"><input type="date" name="from_date" required /></Field><Field label="To"><input type="date" name="to_date" /></Field>
        <Field label="Notes"><input name="notes" /></Field><button className="sec">Add leave</button>
      </form>
    </>
  );
}
