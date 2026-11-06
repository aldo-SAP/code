import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { addAssignment, setProjectStatus } from "@/app/actions";
import { Badge, CurrencySelect, Field, Flash, Hidden } from "@/components/ui";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireManager();
  const { id } = await params; const sp = await searchParams;
  const p = get<any>("SELECT p.*, c.name AS client, c.currency FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=?", Number(id));
  if (!p) notFound();
  const rows = all<any>(`SELECT a.*, per.name AS person, per.worker_type,
      (SELECT amount||' '||currency FROM rates r WHERE r.assignment_id=a.id AND r.kind='bill' AND r.effective_from<=date('now') ORDER BY effective_from DESC LIMIT 1) AS bill,
      (SELECT amount||' '||currency FROM rates r WHERE r.assignment_id=a.id AND r.kind='cost' AND r.effective_from<=date('now') ORDER BY effective_from DESC LIMIT 1) AS cost
    FROM assignments a JOIN people per ON per.id=a.person_id WHERE a.project_id=? ORDER BY a.start_date`, p.id);
  const people = all<any>("SELECT id,name,worker_type FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const freelancerContracts = all<any>("SELECT k.id,k.title,per.name FROM contracts k JOIN people per ON per.id=k.person_id WHERE k.kind='freelancer'");
  const per = (bt: string) => ({ hourly: "/h", daily: "/day", monthly: "/month", fixed: "" }[bt] ?? "");
  return (
    <>
      <h2>{p.name} <Badge v={p.status} /></h2><Flash sp={sp} />
      <p className="muted">Client: <Link href={`/clients/${p.client_id}`}>{p.client}</Link>
        <form action={setProjectStatus} style={{ display: "inline-flex", gap: 6, marginLeft: 12 }}>
          <Hidden name="id" value={p.id} /><Hidden name="_back" value={`/projects/${p.id}`} />
          <select name="status" defaultValue={p.status}>{["planned", "active", "paused", "done"].map((s) => <option key={s}>{s}</option>)}</select><button className="sec sm">Set status</button></form></p>

      <h3>Team</h3>
      <div className="tw"><table><thead><tr><th>Person</th><th>Role</th><th>Billing</th><th>Bill rate</th>{can.finance(user) && <th>Cost rate</th>}<th>Dates</th><th></th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td>{a.person} <span className="muted">({a.worker_type})</span>{a.direct_to_client ? <> <span className="badge">direct to client</span></> : null}</td><td>{a.role_title}</td><td>{a.billing_type}</td>
          <td>{a.bill ? `${a.bill}${per(a.billing_type)}` : a.billing_type === "fixed" ? "milestones" : <span className="badge err">missing</span>}</td>
          {can.finance(user) && <td>{a.cost ? `${a.cost}${per(a.billing_type)}` : a.billing_type === "fixed" ? "milestones" : "-"}</td>}
          <td>{a.start_date} to {a.end_date ?? "open"}</td><td><Link href={`/assignments/${a.id}`}>Rates, substitutes, milestones</Link></td></tr>)}
        {!rows.length && <tr><td colSpan={7} className="muted">Nobody assigned yet.</td></tr>}</tbody></table></div>

      <h3>Assign a person</h3>
      <form action={addAssignment} className="row card">
        <Hidden name="project_id" value={p.id} />
        <Field label="Person (ready students/workers only)"><select name="person_id" required><option value="">-</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.worker_type})</option>)}</select></Field>
        <Field label="Role"><input name="role_title" placeholder="Backend developer" /></Field>
        <Field label="Billing"><select name="billing_type" defaultValue="daily"><option value="daily">Daily rate (hours/8)</option><option value="hourly">Hourly</option><option value="monthly">Monthly full-time fee</option><option value="fixed">Fixed price / task (milestones)</option></select></Field>
        <Field label="Hours per day"><input name="hours_per_day" type="number" step="0.5" defaultValue={8} style={{ width: 70 }} /></Field>
        <Field label="Start"><input type="date" name="start_date" required /></Field><Field label="End"><input type="date" name="end_date" /></Field>
        <Field label="Bill rate (client pays)"><input name="bill_amount" type="number" step="0.01" style={{ width: 100 }} /></Field>
        <Field label="Bill currency"><CurrencySelect name="bill_currency" value={p.currency} /></Field>
        {can.finance(user) && <><Field label="Cost rate (we pay)"><input name="cost_amount" type="number" step="0.01" style={{ width: 100 }} /></Field>
          <Field label="Cost currency"><CurrencySelect name="cost_currency" /></Field></>}
        <Field label="Freelancer contract"><select name="freelancer_contract_id"><option value="">-</option>{freelancerContracts.map((k) => <option key={k.id} value={k.id}>{k.name}: {k.title}</option>)}</select></Field>
        <label className="f"><span>Freelancer works directly with client</span><input type="checkbox" name="direct_to_client" /></label>
        <button>Assign</button>
      </form>
      <p className="muted">Rate units follow the billing type: per hour, per day or per month. Fixed price work is billed through milestones.</p>
    </>
  );
}
