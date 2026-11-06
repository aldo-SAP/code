import { addContract } from "@/app/actions";
import { CurrencySelect, Field, Hidden } from "@/components/ui";

interface P { id: number; name: string; worker_type: string }
/**
 * One contract = one person. The same project can have many contracts (one per person).
 * Creating the contract also creates that person's assignment.
 */
export default function ContractForm({ client, projects, fixedProjectId, people, fin, back }: {
  client: { id: number; currency: string }; projects: { id: number; name: string }[]; fixedProjectId?: number; people: P[]; fin: boolean; back: string;
}) {
  return (
    <form action={addContract} className="row card">
      <Hidden name="kind" value="client" /><Hidden name="client_id" value={client.id} /><Hidden name="_back" value={back} />
      {fixedProjectId ? <Hidden name="project_id" value={fixedProjectId} /> : (
        <>
          <Field label="Project"><select name="project_id"><option value="">+ new project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="New project name (if new)"><input name="project_name" placeholder="defaults to the contract title" /></Field>
        </>
      )}
      <Field label="Contract title"><input name="title" required placeholder="Jane Doe - Portal 2026" /></Field>
      <Field label="Person on this contract *"><select name="person_id" required><option value="">-</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.worker_type})</option>)}</select></Field>
      <Field label="Role"><input name="role_title" /></Field>
      <Field label="Billing"><select name="billing_type" defaultValue="daily"><option value="daily">Daily rate (hours/8)</option><option value="hourly">Hourly</option><option value="monthly">Monthly fee</option><option value="fixed">Fixed price (milestones)</option></select></Field>
      <Field label="Bill rate"><input name="bill_amount" type="number" step="0.01" style={{ width: 100 }} /></Field>
      <Field label="Currency"><CurrencySelect name="bill_currency" value={client.currency} /></Field>
      {fin && <><Field label="Cost rate"><input name="cost_amount" type="number" step="0.01" style={{ width: 100 }} /></Field><Field label="Cost cur."><CurrencySelect name="cost_currency" /></Field></>}
      <div className="pair"><Field label="Start"><input type="date" name="start_date" required /></Field><Field label="End"><input type="date" name="end_date" /></Field></div>
      <Field label="Contract currency"><CurrencySelect value={client.currency} /></Field>
      <Field label="Payment terms"><select name="payment_terms"><option value="monthly">Monthly invoice</option><option value="milestone">Per milestone</option></select></Field>
      <Field label="Net days"><input type="number" name="net_days" defaultValue={30} style={{ width: 70 }} /></Field>
      <Field label="Hours per day"><input type="number" name="hours_per_day" step="0.5" defaultValue={8} style={{ width: 70 }} /></Field>
      <label className="f"><span>Freelancer works directly with client</span><input type="checkbox" name="direct_to_client" /></label>
      <button>Create contract</button>
    </form>
  );
}
