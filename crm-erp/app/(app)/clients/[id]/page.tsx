import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { addContact, addContract, addProject, deleteContact, updateClient } from "@/app/actions";
import { Badge, CurrencySelect, Field, Flash, Hidden, money } from "@/components/ui";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireManager();
  const fin = can.finance(user);
  const people = all<any>("SELECT id,name,worker_type FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const { id } = await params; const sp = await searchParams;
  const c = get<any>("SELECT * FROM clients WHERE id=?", Number(id));
  if (!c) notFound();
  const contacts = all<any>("SELECT * FROM contacts WHERE client_id=?", c.id);
  const contracts = all<any>("SELECT * FROM contracts WHERE kind='client' AND client_id=? ORDER BY id DESC", c.id);
  const projects = all<any>("SELECT * FROM projects WHERE client_id=? ORDER BY id DESC", c.id);
  const deals = all<any>("SELECT * FROM deals WHERE client_id=?", c.id);
  const invoices = all<any>("SELECT * FROM invoices WHERE client_id=? ORDER BY id DESC LIMIT 12", c.id);
  const back = `/clients/${c.id}`;
  return (
    <>
      <h2>{c.name}</h2><Flash sp={sp} />
      <form action={updateClient} className="row card">
        <Hidden name="id" value={c.id} />
        <Field label="Name"><input name="name" defaultValue={c.name} required /></Field>
        <Field label="Country"><input name="country" defaultValue={c.country ?? ""} /></Field>
        <Field label="Email"><input name="email" defaultValue={c.email ?? ""} /></Field>
        <Field label="Currency"><CurrencySelect value={c.currency} /></Field>
        <Field label="Status"><select name="status" defaultValue={c.status}><option>active</option><option>inactive</option></select></Field>
        <Field label="Address"><input name="address" defaultValue={c.address ?? ""} /></Field>
        <Field label="Notes"><input name="notes" defaultValue={c.notes ?? ""} /></Field>
        <button>Save</button>
      </form>

      <h3>Contacts</h3>
      <table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th></th></tr></thead><tbody>
        {contacts.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.role}</td><td>{x.email}</td><td>{x.phone}</td>
          <td><form action={deleteContact}><Hidden name="id" value={x.id} /><Hidden name="_back" value={back} /><button className="danger sm">Remove</button></form></td></tr>)}
        {!contacts.length && <tr><td colSpan={5} className="muted">No contacts.</td></tr>}</tbody></table>
      <form action={addContact} className="row" style={{ marginTop: 8 }}>
        <Hidden name="client_id" value={c.id} />
        <Field label="Name"><input name="name" required /></Field><Field label="Role"><input name="role" /></Field>
        <Field label="Email"><input name="email" /></Field><Field label="Phone"><input name="phone" /></Field><button className="sec">Add contact</button>
      </form>

      <h3>Contracts</h3>
      <table><thead><tr><th>Title</th><th>Period</th><th>Currency</th><th>Payment terms</th><th>Net days</th></tr></thead><tbody>
        {contracts.map((k) => <tr key={k.id}><td>{k.title}</td><td>{k.start_date ?? "?"} to {k.end_date ?? "open"}</td><td>{k.currency}</td><td>{k.payment_terms}</td><td>{k.net_days}</td></tr>)}
        {!contracts.length && <tr><td colSpan={5} className="muted">No contracts.</td></tr>}</tbody></table>
      <h3 style={{ fontSize: 13 }}>New contract (needs its first person)</h3>
      <form action={addContract} className="row card">
        <Hidden name="kind" value="client" /><Hidden name="client_id" value={c.id} /><Hidden name="_back" value={back} />
        <Field label="Contract title"><input name="title" required placeholder="MSA 2026" /></Field>
        <Field label="Project name (default: title)"><input name="project_name" /></Field>
        <Field label="Assigned person *"><select name="person_id" required><option value="">-</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.worker_type})</option>)}</select></Field>
        <Field label="Role"><input name="role_title" /></Field>
        <Field label="Billing"><select name="billing_type" defaultValue="daily"><option value="daily">Daily rate (hours/8)</option><option value="hourly">Hourly</option><option value="monthly">Monthly fee</option><option value="fixed">Fixed price (milestones)</option></select></Field>
        <Field label="Bill rate"><input name="bill_amount" type="number" step="0.01" style={{ width: 100 }} /></Field>
        <Field label="Currency"><CurrencySelect name="bill_currency" value={c.currency} /></Field>
        {fin && <><Field label="Cost rate"><input name="cost_amount" type="number" step="0.01" style={{ width: 100 }} /></Field><Field label="Cost cur."><CurrencySelect name="cost_currency" /></Field></>}
        <Field label="Start"><input type="date" name="start_date" required /></Field><Field label="End"><input type="date" name="end_date" /></Field>
        <Field label="Contract currency"><CurrencySelect value={c.currency} /></Field>
        <Field label="Payment terms"><select name="payment_terms"><option value="monthly">Monthly invoice</option><option value="milestone">Per milestone</option></select></Field>
        <Field label="Net days"><input type="number" name="net_days" defaultValue={30} style={{ width: 70 }} /></Field>
        <label className="f"><span>Freelancer works directly with client</span><input type="checkbox" name="direct_to_client" /></label>
        <button>Create contract</button>
      </form>

      <h3>Projects</h3>
      <table><thead><tr><th>Project</th><th>Contract</th><th>Status</th></tr></thead><tbody>
        {projects.map((p) => <tr key={p.id}><td><Link href={`/projects/${p.id}`}>{p.name}</Link></td><td>{contracts.find((k) => k.id === p.client_contract_id)?.title ?? "-"}</td><td><Badge v={p.status} /></td></tr>)}
        {!projects.length && <tr><td colSpan={3} className="muted">No projects.</td></tr>}</tbody></table>
      <form action={addProject} className="row" style={{ marginTop: 8 }}>
        <Hidden name="client_id" value={c.id} />
        <Field label="Project name"><input name="name" required /></Field>
        <Field label="Contract"><select name="client_contract_id" required><option value="">- pick a contract -</option>{contracts.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}</select></Field>
        <Field label="Start"><input type="date" name="start_date" /></Field>
        <button className="sec">Add project</button>
      </form>

      {!!deals.length && <><h3>Deals</h3><table><tbody>{deals.map((d) => <tr key={d.id}><td>{d.title}</td><td><Badge v={d.stage} /></td><td className="num">{money(d.value, d.currency)}</td></tr>)}</tbody></table></>}
      {!!invoices.length && <><h3>Recent invoices</h3><table><tbody>{invoices.map((i) => <tr key={i.id}><td><Link href={`/invoices/${i.id}`}>{i.number ?? `Draft #${i.id}`}</Link></td><td>{i.period}</td><td><Badge v={i.status} /></td><td className="num">{money(i.total, i.currency)}</td></tr>)}</tbody></table></>}
    </>
  );
}
