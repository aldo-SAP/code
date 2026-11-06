import Link from "next/link";
import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/auth";
import { leaveContext } from "@/lib/leave";
import { auditFor } from "@/lib/audit";
import { cancelLeaveAction, decideLeaveAction, revokeLeaveAction } from "@/app/actions";
import { Badge, Flash, Hidden, num, today } from "@/components/ui";

export default async function LeaveDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser();
  const { id } = await params; const sp = await searchParams;
  const l = await get<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.id=?", Number(id));
  const manager = can.manage(user);
  if (!l || (!manager && l.person_id !== user.person_id)) notFound();
  const ctx = manager ? await leaveContext(l) : null;
  const history = manager ? await auditFor("leave", l.id) : [];
  const own = l.person_id === user.person_id;
  const uncovered = ctx ? ctx.assignments.filter((a) => (a.billing_type === "hourly" || a.billing_type === "daily") && !ctx.substitutes.some((s) => s.assignment_id === a.id)) : [];
  return (
    <>
      <p><Link href="/leave">&larr; Leave</Link></p>
      <h2>{l.name}: {l.type} <Badge v={l.status} /></h2><Flash sp={sp} />
      <div className="card">
        <b>{l.from_date} to {l.to_date}</b> ({l.days} working day{l.days === 1 ? "" : "s"})
        {l.notes && <p>Note: {l.notes}</p>}
        <p className="muted" style={{ marginBottom: 0 }}>Requested {l.requested_at?.slice(0, 16)} UTC{l.decided_by_name ? ` · ${l.status} by ${l.decided_by_name}${l.decided_at ? " on " + l.decided_at.slice(0, 16) : ""}` : ""}{l.decision_note ? ` · "${l.decision_note}"` : ""}</p>
      </div>

      {ctx && (
        <div className="card">
          <b>Before you decide</b>
          <ul>
            {ctx.assignments.length ? ctx.assignments.map((a) => <li key={a.id}>Works on <Link href={`/assignments/${a.id}`}>{a.project}</Link> ({a.client}, {a.billing_type}).</li>) : <li>No active assignment in this period.</li>}
            {ctx.substitutes.map((s, k) => <li key={k}>Substitute arranged: {s.substitute}, {s.from_date} to {s.to_date}.</li>)}
            {uncovered.length > 0 && <li><b>No substitute is set</b> for {uncovered.map((a) => a.project).join(", ")}. Add one on the assignment page if the client needs cover.</li>}
            {ctx.logged.n > 0 && <li><b>{ctx.logged.n} day(s) with {num(ctx.logged.h)}h are already logged</b> inside these dates.</li>}
            <li>{ctx.balance.year} allowance: <b>{num(ctx.balance.remaining)}</b> of {num(ctx.balance.allowance)} days left ({num(ctx.balance.taken)} taken, {num(ctx.balance.planned)} planned, {num(ctx.balance.pending)} waiting). <Link href={`/people/${l.person_id}?year=${ctx.balance.year}`}>See the full year</Link>.</li>
            {ctx.colleagues.map((c, k) => <li key={k}>Colleague on the same project: {c.name} is off {c.from_date} to {c.to_date} ({c.status}).</li>)}
          </ul>
        </div>
      )}

      {manager && l.status === "requested" && !own && (
        <form action={decideLeaveAction} className="row card">
          <Hidden name="rid" value={l.id} /><Hidden name="_back" value={`/leave/${l.id}`} />
          <input name="note" placeholder="Note to the worker (required to reject)" style={{ width: 320 }} />
          <button name="decision" value="approve">Approve</button><button name="decision" value="reject" className="danger">Reject</button>
        </form>
      )}
      {manager && l.status === "requested" && own && <div className="flash err">This is your own request, so another manager has to decide it.</div>}
      {manager && l.status === "approved" && !own && l.from_date >= today() && (
        <form action={revokeLeaveAction} className="card" style={{ display: "grid", gap: 8 }}>
          <Hidden name="rid" value={l.id} /><Hidden name="_back" value={`/leave/${l.id}`} />
          <b>Withdraw this approval</b>
          <span className="muted">Use this if project needs change. The {l.days} day{l.days === 1 ? "" : "s"} go back to the employee's allowance, and the employee and approvers are emailed in the same thread.</span>
          <input name="note" required minLength={3} placeholder="Reason for the employee" />
          <div><button className="danger">Withdraw approval</button></div>
        </form>
      )}
      {(l.status === "requested" || (l.status === "approved" && (manager || l.to_date >= today()))) && (own || manager) && (
        <form action={cancelLeaveAction}><Hidden name="rid" value={l.id} /><Hidden name="_back" value={`/leave/${l.id}`} /><button className="danger">{l.status === "requested" ? "Withdraw request" : "Cancel leave"}</button></form>
      )}

      {history.length > 0 && <>
        <h3>History</h3>
        <table><tbody>{history.map((h) => <tr key={h.id}><td style={{ whiteSpace: "nowrap" }}>{h.created_at}</td><td>{h.user_name}</td><td>{h.summary}{h.reason ? <span className="muted"> - {h.reason}</span> : null}</td></tr>)}</tbody></table>
      </>}
    </>
  );
}
