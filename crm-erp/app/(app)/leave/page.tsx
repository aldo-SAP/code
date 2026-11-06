import Link from "next/link";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { periodRange } from "@/lib/billing";
import { addLeave, cancelLeaveAction, decideLeaveAction } from "@/app/actions";
import { Badge, Field, Flash, Hidden, thisMonth, today } from "@/components/ui";

export default async function Leave({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; month?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = can.manage(user);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const mine = user.person_id ? await all<any>("SELECT * FROM leave WHERE person_id=? AND status<>'cancelled' OR (person_id=? AND to_date>=?) ORDER BY from_date DESC LIMIT 40", user.person_id, user.person_id, today()) : [];
  const pending = manager ? await all<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.status='requested' ORDER BY l.from_date") : [];
  const people = manager ? await all<any>("SELECT id,name FROM people WHERE stage IN ('ready','placed') ORDER BY name") : [];
  const { start, end } = periodRange(month);
  const days = Array.from({ length: Number(end.slice(8)) }, (_, k) => `${month}-${String(k + 1).padStart(2, "0")}`);
  const cal = manager ? await all<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.status IN ('requested','approved') AND l.to_date>=? AND l.from_date<=? ORDER BY p.name, l.from_date", start, end) : [];
  const names = [...new Set(cal.map((c) => c.name))];
  const shift = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); };
  const types = (m: boolean) => (m ? ["vacation", "sick", "holiday", "other"] : ["vacation", "sick", "other"]);
  return (
    <>
      <h2>Leave</h2><Flash sp={sp} />

      {manager && (
        <>
          <h3>Waiting for your decision ({pending.length})</h3>
          <div className="tw"><table><thead><tr><th>Person</th><th>Type</th><th>Dates</th><th className="num">Working days</th><th>Note</th><th>Decision</th></tr></thead><tbody>
            {pending.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/leave/${l.id}`}>{l.name}</Link></td><td>{l.type}</td><td>{l.from_date} to {l.to_date}</td><td className="num">{l.days}</td><td>{l.notes}</td>
                <td>{l.person_id === user.person_id ? <span className="muted">your own request: another manager decides</span> : (
                  <form action={decideLeaveAction} className="row"><Hidden name="rid" value={l.id} />
                    <input name="note" placeholder="Note (required to reject)" style={{ width: 190 }} />
                    <button name="decision" value="approve" className="sm">Approve</button><button name="decision" value="reject" className="danger sm">Reject</button></form>)}</td>
              </tr>))}
            {!pending.length && <tr><td colSpan={6} className="muted">No requests waiting.</td></tr>}</tbody></table></div>
        </>
      )}

      {user.person_id && (
        <>
          <h3>{manager ? "My leave" : "Request leave"}</h3>
          <form action={addLeave} className="row card">
            <Hidden name="person_id" value={user.person_id} />
            <Field label="Type"><select name="type">{types(manager).map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="From"><input type="date" name="from_date" required min={today()} /></Field>
            <Field label="To (same day if empty)"><input type="date" name="to_date" /></Field>
            <Field label="Note"><input name="notes" style={{ width: 240 }} /></Field>
            <button>{manager ? "Record my leave" : "Send request"}</button>
            <span className="muted">Vacation needs approval. Sick leave is recorded at once and your managers are told. Weekends are not counted.</span>
          </form>
          <div className="tw"><table><thead><tr><th>Type</th><th>Dates</th><th className="num">Days</th><th>Status</th><th>Decision</th><th></th></tr></thead><tbody>
            {mine.map((l) => (
              <tr key={l.id}><td>{l.type}</td><td><Link href={`/leave/${l.id}`}>{l.from_date} to {l.to_date}</Link></td><td className="num">{l.days}</td><td><Badge v={l.status} /></td>
                <td className="muted">{l.decided_by_name ? `${l.decided_by_name}${l.decision_note ? `: ${l.decision_note}` : ""}` : ""}</td>
                <td>{(l.status === "requested" || (l.status === "approved" && l.to_date >= today())) && <form action={cancelLeaveAction}><Hidden name="rid" value={l.id} /><button className="danger sm">{l.status === "requested" ? "Withdraw" : "Cancel"}</button></form>}</td></tr>))}
            {!mine.length && <tr><td colSpan={6} className="muted">No leave yet.</td></tr>}</tbody></table></div>
        </>
      )}
      {!user.person_id && !manager && <div className="card muted">Your login is not linked to a person record. Ask an admin.</div>}

      {manager && (
        <>
          <h3>Team calendar</h3>
          <div className="bar">
            <Link className="btn sec" href={`/leave?month=${shift(month, -1)}`}>&larr; {shift(month, -1)}</Link>
            <b>{month}</b>
            <Link className="btn sec" href={`/leave?month=${shift(month, 1)}`}>{shift(month, 1)} &rarr;</Link>
            <span className="muted">Green = approved, yellow = waiting for a decision.</span>
          </div>
          {names.length ? (
            <div className="tw"><table className="cal"><thead><tr><th></th>{days.map((d) => <th key={d}>{Number(d.slice(8))}</th>)}</tr></thead><tbody>
              {names.map((n) => (
                <tr key={n}><td>{n}</td>{days.map((d) => {
                  const hit = cal.find((c) => c.name === n && c.from_date <= d && d <= c.to_date);
                  const wk = [0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());
                  return <td key={d} className={wk ? "we" : hit ? (hit.status === "approved" ? "a" : "r") : ""}>{hit && !wk ? "•" : ""}</td>;
                })}</tr>))}
            </tbody></table></div>
          ) : <p className="muted">Nobody is off this month.</p>}

          <h3>Record leave for someone</h3>
          <form action={addLeave} className="row card">
            <Field label="Person"><select name="person_id" required><option value="">-</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Type"><select name="type">{types(true).map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="From"><input type="date" name="from_date" required /></Field><Field label="To"><input type="date" name="to_date" /></Field>
            <Field label="Note"><input name="notes" /></Field><button className="sec">Record (approved at once)</button>
          </form>
        </>
      )}
    </>
  );
}
