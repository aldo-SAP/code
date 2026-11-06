import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { reopenEntries, reviewEntries } from "@/app/actions";
import { Flash, Hidden, num } from "@/components/ui";

function groups(status: string, extra = "") {
  const rows = all<any>(`SELECT t.id,t.work_date,t.hours,t.worker_id,t.assignment_id,w.name AS worker,pr.name AS project,o.name AS owner,a.person_id AS owner_id,a.hours_per_day
    FROM timesheet_entries t JOIN people w ON w.id=t.worker_id JOIN assignments a ON a.id=t.assignment_id JOIN projects pr ON pr.id=a.project_id JOIN people o ON o.id=a.person_id
    WHERE t.status=? ${extra} ORDER BY w.name, pr.name, t.work_date`, status);
  const map = new Map<string, any>();
  for (const r of rows) {
    const k = `${r.worker_id}|${r.assignment_id}|${r.work_date.slice(0, 7)}`;
    const g = map.get(k) ?? { ...r, month: r.work_date.slice(0, 7), ids: [] as number[], hours: 0, days: [] as string[] };
    g.ids.push(r.id); g.hours += r.hours; g.days.push(`${Number(r.work_date.slice(8))}: ${r.hours}`);
    map.set(k, g);
  }
  return [...map.values()];
}

export default async function Approvals({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const submitted = groups("submitted");
  const approved = groups("approved", "AND t.invoice_id IS NULL AND t.payout_id IS NULL");
  const row = (g: any, actions: React.ReactNode) => (
    <tr key={`${g.worker_id}${g.assignment_id}${g.month}`}>
      <td><Link href={`/timesheets?person=${g.worker_id}&month=${g.month}`}>{g.worker}</Link>{g.owner_id !== g.worker_id && <span className="muted"> (for {g.owner})</span>}</td>
      <td>{g.project}</td><td>{g.month}</td><td className="num">{num(g.hours)}h / {num(g.hours / g.hours_per_day)}d</td>
      <td className="muted" style={{ maxWidth: 360 }}>{g.days.join(", ")}</td><td>{actions}</td></tr>
  );
  return (
    <>
      <h2>Approvals</h2><Flash sp={sp} />
      <h3>Waiting for approval</h3>
      <div className="tw"><table><thead><tr><th>Person</th><th>Project</th><th>Month</th><th className="num">Total</th><th>Days: hours</th><th></th></tr></thead><tbody>
        {submitted.map((g) => row(g, <form action={reviewEntries} className="row"><Hidden name="ids" value={g.ids.join(",")} />
          <button name="decision" value="approve" className="sm">Approve</button><button name="decision" value="reject" className="danger sm">Reject</button></form>))}
        {!submitted.length && <tr><td colSpan={6} className="muted">Nothing waiting.</td></tr>}</tbody></table></div>
      <p className="muted">Hours already on an invoice or payout are locked. To correct them use <Link href="/unlock">Unlock billed hours</Link> (needs a reason, everything is logged).</p>
      <h3>Approved, not yet invoiced</h3>
      <div className="tw"><table><thead><tr><th>Person</th><th>Project</th><th>Month</th><th className="num">Total</th><th>Days: hours</th><th></th></tr></thead><tbody>
        {approved.map((g) => row(g, <form action={reopenEntries}><Hidden name="ids" value={g.ids.join(",")} /><button className="sec sm">Reopen</button></form>))}
        {!approved.length && <tr><td colSpan={6} className="muted">None.</td></tr>}</tbody></table></div>
    </>
  );
}
