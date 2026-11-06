import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { setProjectStatus } from "@/app/actions";
import ContractForm from "@/components/ContractForm";
import { Badge, CurrencySelect, Field, Flash, Hidden } from "@/components/ui";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireManager();
  const { id } = await params; const sp = await searchParams;
  const p = await get<any>("SELECT p.*, c.name AS client, c.currency, c.id AS cid FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=?", Number(id));
  if (!p) notFound();
  const rows = await all<any>(`SELECT a.*, per.name AS person, per.worker_type, k.title AS contract,
      (SELECT amount||' '||currency FROM rates r WHERE r.assignment_id=a.id AND r.kind='bill' AND r.effective_from<=to_char(current_date,'YYYY-MM-DD') ORDER BY effective_from DESC LIMIT 1) AS bill,
      (SELECT amount||' '||currency FROM rates r WHERE r.assignment_id=a.id AND r.kind='cost' AND r.effective_from<=to_char(current_date,'YYYY-MM-DD') ORDER BY effective_from DESC LIMIT 1) AS cost
    FROM assignments a JOIN people per ON per.id=a.person_id LEFT JOIN contracts k ON k.id=a.client_contract_id WHERE a.project_id=? ORDER BY a.start_date`, p.id);
  const people = await all<any>("SELECT id,name,worker_type FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const per = (bt: string) => ({ hourly: "/h", daily: "/day", monthly: "/month", fixed: "" }[bt] ?? "");
  return (
    <>
      <h2>{p.name} <Badge v={p.status} /></h2><Flash sp={sp} />
      <p className="muted">Client: <Link href={`/clients/${p.client_id}`}>{p.client}</Link>
        <form action={setProjectStatus} style={{ display: "inline-flex", gap: 6, marginLeft: 12 }}>
          <Hidden name="rid" value={p.id} /><Hidden name="_back" value={`/projects/${p.id}`} />
          <select name="status" defaultValue={p.status}>{["planned", "active", "paused", "done"].map((s) => <option key={s}>{s}</option>)}</select><button className="sec sm">Set status</button></form></p>

      <h3>Team</h3>
      <div className="tw"><table><thead><tr><th>Person</th><th>Contract</th><th>Role</th><th>Billing</th><th>Bill rate</th>{can.finance(user) && <th>Cost rate</th>}<th>Dates</th><th></th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td>{a.person} <span className="muted">({a.worker_type})</span>{a.direct_to_client ? <> <span className="badge">direct to client</span></> : null}</td><td>{a.contract}</td><td>{a.role_title}</td><td>{a.billing_type}</td>
          <td>{a.bill ? `${a.bill}${per(a.billing_type)}` : a.billing_type === "fixed" ? "milestones" : <span className="badge err">missing</span>}</td>
          {can.finance(user) && <td>{a.cost ? `${a.cost}${per(a.billing_type)}` : a.billing_type === "fixed" ? "milestones" : "-"}</td>}
          <td>{a.start_date} to {a.end_date ?? "open"}</td><td><Link href={`/assignments/${a.id}`}>Rates, substitutes, milestones</Link></td></tr>)}
        {!rows.length && <tr><td colSpan={8} className="muted">Nobody assigned yet.</td></tr>}</tbody></table></div>

      <h3>Add a person (new contract)</h3>
      <p className="muted">Each person on this project has their own client contract, with their own rate and terms.</p>
      <ContractForm client={{ id: p.client_id, currency: p.currency }} projects={[]} fixedProjectId={p.id} people={people} fin={can.finance(user)} back={`/projects/${p.id}`} />
      <p className="muted">Rate units follow the billing type: per hour, per day or per month. Fixed price work is billed through milestones.</p>
    </>
  );
}
