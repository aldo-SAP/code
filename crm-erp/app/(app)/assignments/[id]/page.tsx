import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { addMilestone, addRate, addSubstitution, deleteRate, deleteSubstitution, setMilestone, updateSubstitutionCost } from "@/app/actions";
import { billedThrough } from "@/lib/history";
import { Badge, CurrencySelect, Field, Flash, Hidden, money, today } from "@/components/ui";

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireManager();
  const { id } = await params; const sp = await searchParams;
  const a = await get<any>(`SELECT a.*, pr.name AS project, pr.client_id, per.name AS person, per.worker_type, cl.currency AS client_currency, k.title AS contract, k.payment_terms, k.net_days
    FROM assignments a JOIN projects pr ON pr.id=a.project_id JOIN people per ON per.id=a.person_id JOIN clients cl ON cl.id=pr.client_id LEFT JOIN contracts k ON k.id=a.client_contract_id WHERE a.id=?`, Number(id));
  if (!a) notFound();
  const fin = can.finance(user);
  const rates = await all<any>(`SELECT * FROM rates WHERE assignment_id=? ${fin ? "" : "AND kind='bill'"} ORDER BY kind, effective_from DESC`, a.id);
  const subs = await all<any>("SELECT s.*, p.name, p.worker_type FROM substitutions s JOIN people p ON p.id=s.person_id WHERE assignment_id=? ORDER BY from_date DESC", a.id);
  const milestones = await all<any>("SELECT * FROM milestones WHERE assignment_id=? ORDER BY id", a.id);
  const candidates = await all<any>("SELECT id,name,worker_type FROM people WHERE stage IN ('ready','placed') AND id<>? ORDER BY name", a.person_id);
  const hours = await all<any>(`SELECT status, SUM(hours) h FROM timesheet_entries WHERE assignment_id=? GROUP BY status`, a.id);
  const back = `/assignments/${a.id}`;
  const through = await billedThrough(a.id);
  const unit = { hourly: "per hour", daily: "per day", monthly: "per month", fixed: "" }[a.billing_type as string];
  return (
    <>
      <h2>{a.person} on {a.project}</h2><Flash sp={sp} />
      <p className="muted"><Link href={`/projects/${a.project_id}`}>Back to project</Link> · contract: {a.contract ?? "-"} ({a.payment_terms}, net {a.net_days}) · {a.billing_type} · {a.hours_per_day}h/day · {a.start_date} to {a.end_date ?? "open"} · {a.worker_type}
        {a.direct_to_client ? " · works directly with the client" : ""}</p>
      {through && <div className="flash err">Hours up to {through} are already invoiced or paid out. Changes that reach back before that date need a reason and are logged. <Link href={`/unlock?person=${a.person_id}&month=${through.slice(0, 7)}`}>Unlock billed hours</Link></div>}
      <p>{hours.map((h) => <span key={h.status} style={{ marginRight: 10 }}><Badge v={h.status} /> {h.h}h</span>)}{!hours.length && <span className="muted">No hours logged yet.</span>}</p>

      {a.billing_type !== "fixed" && <>
        <h3>Rates {unit}</h3>
        <p className="muted">Rates are effective-dated: a new rate applies from its date onward and old invoices keep the old rate.</p>
        <table><thead><tr><th>Kind</th><th>Amount</th><th>Effective from</th><th></th></tr></thead><tbody>
          {rates.map((r) => <tr key={r.id}><td>{r.kind === "bill" ? "Bill (client pays)" : "Cost (we pay)"}</td><td>{money(r.amount, r.currency)}</td><td>{r.effective_from}</td>
            <td><form action={deleteRate} className="row"><Hidden name="rid" value={r.id} />
              {through && r.effective_from <= through && <><input name="reason" placeholder="Reason" minLength={5} style={{ width: 130 }} /><label className="f"><span><input type="checkbox" name="confirm_history" /> I know hours up to {through} are billed</span></label></>}
              <button className="danger sm">Remove</button></form></td></tr>)}
          {!rates.length && <tr><td colSpan={4} className="muted">No rates.</td></tr>}</tbody></table>
        <form action={addRate} className="row" style={{ marginTop: 8 }}>
          <Hidden name="assignment_id" value={a.id} />
          <Field label="Kind"><select name="kind"><option value="bill">Bill</option>{fin && <option value="cost">Cost</option>}</select></Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" required style={{ width: 110 }} /></Field>
          <Field label="Currency"><CurrencySelect value={a.client_currency} /></Field>
          <Field label="Effective from"><input type="date" name="effective_from" defaultValue={today()} required /></Field>
          {through && <><Field label={`Reason (needed if effective on/before ${through})`}><input name="reason" /></Field>
            <label className="f"><span><input type="checkbox" name="confirm_history" /> Hours up to {through} are already billed; I confirm</span></label></>}
          <button className="sec">Add rate</button>
        </form>
      </>}

      {(a.billing_type === "hourly" || a.billing_type === "daily") && <>
        <h3>Substitutions</h3>
        <p className="muted">When {a.person} is away and someone else works instead, the client invoice still shows {a.person} only, with the substitute's hours included. The substitute is paid separately (external substitutes only; internal ones are on payroll).</p>
        <table><thead><tr><th>Substitute</th><th>From</th><th>To</th><th>Reason</th>{fin && <th>Cost rate {unit}</th>}<th></th></tr></thead><tbody>
          {subs.map((s) => <tr key={s.id}><td>{s.name} <span className="muted">({s.worker_type})</span></td><td>{s.from_date}</td><td>{s.to_date}</td><td>{s.reason}</td>
            {fin && <td><form action={updateSubstitutionCost} className="row"><Hidden name="rid" value={s.id} /><Hidden name="_back" value={back} />
              {s.worker_type === "external" ? <><input name="cost_amount" type="number" step="0.01" defaultValue={s.cost_amount ?? ""} style={{ width: 90 }} placeholder="missing" /><CurrencySelect name="cost_currency" value={s.cost_currency} /><button className="sec sm">Save</button></> : <span className="muted">payroll</span>}</form></td>}
            <td><form action={deleteSubstitution}><Hidden name="rid" value={s.id} /><Hidden name="_back" value={back} /><button className="danger sm">Remove</button></form></td></tr>)}
          {!subs.length && <tr><td colSpan={6} className="muted">No substitutions.</td></tr>}</tbody></table>
        <form action={addSubstitution} className="row" style={{ marginTop: 8 }}>
          <Hidden name="assignment_id" value={a.id} />
          <Field label="Substitute"><select name="person_id" required><option value="">-</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.worker_type})</option>)}</select></Field>
          <Field label="From"><input type="date" name="from_date" required /></Field><Field label="To"><input type="date" name="to_date" required /></Field>
          <Field label="Reason"><input name="reason" placeholder="sick leave" /></Field>
          {fin && <><Field label={`Cost rate ${unit}`}><input name="cost_amount" type="number" step="0.01" style={{ width: 100 }} /></Field><Field label="Currency"><CurrencySelect name="cost_currency" /></Field></>}
          <button className="sec">Add substitution</button>
        </form>
      </>}

      {a.billing_type === "fixed" && <>
        <h3>Milestones</h3>
        <p className="muted">Approve a milestone when the work is accepted. It is then invoiced in the next invoice run (its own invoice if the client contract is "per milestone").</p>
        <table><thead><tr><th>Milestone</th><th>Due</th><th className="num">Bill</th>{fin && <th className="num">Cost</th>}<th>Status</th><th></th></tr></thead><tbody>
          {milestones.map((m) => <tr key={m.id}><td>{m.title}</td><td>{m.due_date}</td><td className="num">{money(m.bill_amount, m.bill_currency)}</td>{fin && <td className="num">{money(m.cost_amount, m.cost_currency)}</td>}
            <td><Badge v={m.status} />{m.invoice_id ? " invoiced" : ""}</td>
            <td>{!m.invoice_id && !m.payout_id && <form action={setMilestone} className="row"><Hidden name="rid" value={m.id} />
              {m.status !== "approved" && <button name="status" value="approved" className="sec sm">Approve</button>}
              {m.status === "approved" && <button name="status" value="planned" className="sec sm">Unapprove</button>}
              {m.status !== "cancelled" && <button name="status" value="cancelled" className="danger sm">Cancel</button>}</form>}</td></tr>)}
          {!milestones.length && <tr><td colSpan={6} className="muted">No milestones.</td></tr>}</tbody></table>
        <form action={addMilestone} className="row" style={{ marginTop: 8 }}>
          <Hidden name="assignment_id" value={a.id} />
          <Field label="Title"><input name="title" required /></Field><Field label="Due"><input type="date" name="due_date" /></Field>
          <Field label="Bill amount"><input name="bill_amount" type="number" step="0.01" style={{ width: 100 }} /></Field><Field label="Currency"><CurrencySelect name="bill_currency" value={a.client_currency} /></Field>
          {fin && <><Field label="Cost amount"><input name="cost_amount" type="number" step="0.01" style={{ width: 100 }} /></Field><Field label="Currency"><CurrencySelect name="cost_currency" /></Field></>}
          <button className="sec">Add milestone</button>
        </form>
      </>}
    </>
  );
}
