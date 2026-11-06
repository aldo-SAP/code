import Link from "next/link";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { periodRange } from "@/lib/billing";
import { addLeave, cancelLeaveAction, decideLeaveAction } from "@/app/actions";
import LeaveTimeline from "@/components/LeaveTimeline";
import { leaveBalance } from "@/lib/leave";
import { countryName, holidayCountryOf, personHolidays } from "@/lib/holidays";
import { Badge, Field, Flash, Hidden, num, thisMonth, today } from "@/components/ui";
import { fmtMonth, fmtMonthShort, fmtRange } from "@/lib/dates";
import PageHead from "@/components/PageHead";
import DataTable, { type Row } from "@/components/DataTable";

export default async function Leave({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; month?: string; year?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = can.manage(user);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : new Date().getFullYear();
  const open = user.person_id ? await all<any>("SELECT * FROM leave WHERE person_id=? AND (status='requested' OR (status='approved' AND to_date>=?)) ORDER BY from_date", user.person_id, today()) : [];
  const pending = manager ? await all<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.status='requested' ORDER BY l.from_date") : [];
  const people = manager ? await all<any>("SELECT id,name FROM people WHERE stage IN ('ready','placed') ORDER BY name") : [];
  const { start, end } = periodRange(month);
  const days = Array.from({ length: Number(end.slice(8)) }, (_, k) => `${month}-${String(k + 1).padStart(2, "0")}`);
  const cal = manager ? await all<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.status IN ('requested','approved') AND l.to_date>=? AND l.from_date<=? ORDER BY p.name, l.from_date", start, end) : [];
  const names = [...new Set(cal.map((c) => c.name))];
  const holOf = new Map<number, Map<string, string>>();
  for (const pid of new Set(cal.map((c) => c.person_id as number))) holOf.set(pid, await personHolidays(pid, start, end));
  const myCountry = user.person_id ? await holidayCountryOf(user.person_id) : null;
  const balances = manager ? await Promise.all(people.map(async (p) => ({ p, b: await leaveBalance(p.id, year) }))) : [];
  const shift = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); };
  const types = (m: boolean) => (m ? ["vacation", "sick", "holiday", "other"] : ["vacation", "sick", "other"]);
  const pendingRows: Row[] = pending.map((l) => ({ id: l.id, person: { t: l.name, href: `/leave/${l.id}` }, type: l.type, dates: { t: fmtRange(l.from_date, l.to_date), s: l.from_date }, days: l.days, note: l.notes,
    decision: l.person_id === user.person_id ? { t: "your own request: another manager decides", muted: true }
      : { t: "", forms: [{ action: decideLeaveAction, hidden: { rid: l.id }, input: { name: "note", placeholder: "Note (required to reject)" }, buttons: [{ label: "Approve", name: "decision", value: "approve" }, { label: "Reject", name: "decision", value: "reject", variant: "danger" }] }] } }));
  const openRows: Row[] = open.map((l) => ({ id: l.id, type: l.type, dates: { t: fmtRange(l.from_date, l.to_date), s: l.from_date, href: `/leave/${l.id}` }, days: l.days, status: { t: l.status, badge: true },
    cancel: { t: "", forms: [{ action: cancelLeaveAction, hidden: { rid: l.id }, buttons: [{ label: l.status === "requested" ? "Withdraw" : "Cancel", variant: "danger" }] }] } }));
  const allowRows: Row[] = balances.map(({ p, b }) => ({ id: p.id, person: { t: p.name, href: `/people/${p.id}?year=${year}` }, allowance: num(b.allowance), taken: num(b.taken), planned: num(b.planned), waiting: num(b.pending), left: { t: num(b.remaining), s: b.remaining } }));
  return (
    <>
      <PageHead title="Leave" sub="Requests, allowances and who is away." /><Flash sp={sp} />

      {manager && (
        <>
          <h2>Waiting for your decision ({pending.length})</h2>
          <DataTable rows={pendingRows} empty="No requests waiting."
            cols={[{ key: "person", label: "Person" }, { key: "type", label: "Type", filter: "select" }, { key: "dates", label: "Dates", filter: "none" }, { key: "days", label: "Working days", num: true, filter: "none" }, { key: "note", label: "Note", phoneHidden: true }, { key: "decision", label: "Decision", filter: "none", sort: false }]} />
        </>
      )}

      {user.person_id && (
        <>
          <h2>{manager ? "My leave" : "Request leave"}</h2>
          <form action={addLeave} className="row card">
            <Hidden name="person_id" value={user.person_id} />
            <div className="wide"><Field label="Type"><select name="type">{types(manager).map((t) => <option key={t}>{t}</option>)}</select></Field></div>
            <div className="pair"><Field label="From"><input type="date" name="from_date" required min={today()} /></Field>
            <Field label="To"><input type="date" name="to_date" /></Field></div>
            <div className="wide"><Field label="Note"><input name="notes" /></Field></div>
            <button>{manager ? "Record my leave" : "Send request"}</button>
            <span className="muted">Leave "To" empty for a single day. Vacation needs approval. Sick leave is recorded at once and your managers are told. Weekends{myCountry ? ` and ${countryName(myCountry)} public holidays` : ""} are not counted.</span>
          </form>
          {open.length > 0 && <>
            <h2 style={{ fontSize: 13 }}>Open and upcoming</h2>
            <DataTable rows={openRows} empty="Nothing open."
              cols={[{ key: "type", label: "Type", filter: "select" }, { key: "dates", label: "Dates", filter: "none" }, { key: "days", label: "Days", num: true, filter: "none" }, { key: "status", label: "Status", filter: "select" }, { key: "cancel", label: "", filter: "none", sort: false }]} />
          </>}
          <h2>My year</h2>
          <LeaveTimeline personId={user.person_id} year={year} basePath="/leave" />
        </>
      )}
      {!user.person_id && !manager && <div className="card muted">Your login is not linked to a person record. Ask an admin.</div>}

      {manager && (
        <>
          <h2>Team calendar</h2>
          <div className="bar">
            <Link className="btn sec" href={`/leave?month=${shift(month, -1)}`}>&larr; {fmtMonthShort(shift(month, -1))}</Link>
            <b>{fmtMonth(month)}</b>
            <Link className="btn sec" href={`/leave?month=${shift(month, 1)}`}>{fmtMonthShort(shift(month, 1))} &rarr;</Link>
            <span className="muted">Green = approved, yellow = waiting for a decision.</span>
          </div>
          {names.length ? (
            <div className="tw"><table className="cal"><thead><tr><th></th>{days.map((d) => <th key={d}>{Number(d.slice(8))}</th>)}</tr></thead><tbody>
              {names.map((n) => (
                <tr key={n}><td>{n}</td>{days.map((d) => {
                  const hit = cal.find((c) => c.name === n && c.from_date <= d && d <= c.to_date);
                  const wk = [0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());
                  const ph = cal.find((c) => c.name === n) && holOf.get(cal.find((c) => c.name === n)!.person_id)?.get(d);
                  return <td key={d} className={wk ? "we" : hit ? (hit.status === "approved" ? "a" : "r") : ph ? "h" : ""} title={ph}>{hit && !wk ? "•" : ""}</td>;
                })}</tr>))}
            </tbody></table></div>
          ) : <p className="muted">Nobody is off this month.</p>}

          <h2>Allowances {year}</h2>
          <DataTable rows={allowRows} empty="Nobody to show." initialSort={[{ id: "person", desc: false }]}
            cols={[{ key: "person", label: "Person" }, { key: "allowance", label: "Allowance", num: true, filter: "none" }, { key: "taken", label: "Taken", num: true, filter: "none" }, { key: "planned", label: "Planned", num: true, filter: "none" }, { key: "waiting", label: "Waiting", num: true, filter: "none" }, { key: "left", label: "Left", num: true, filter: "none" }]} />

          <h2>Add leave for someone (no approval needed)</h2>
          <form action={addLeave} className="row card">
            <Field label="Person"><select name="person_id" required><option value="">-</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Type"><select name="type">{types(true).map((t) => <option key={t}>{t}</option>)}</select></Field>
            <div className="pair"><Field label="From"><input type="date" name="from_date" required /></Field><Field label="To"><input type="date" name="to_date" /></Field></div>
            <div className="wide"><Field label="Note"><input name="notes" /></Field></div><label className="f wide" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" name="notify" /> <span>Also email the employee (leave unticked for sick days and past leave: it is only added to their history)</span></label><button className="sec">Add to their history</button>
          </form>
        </>
      )}
    </>
  );
}
