import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { addContact, addProject, deleteContact, updateClient } from "@/app/actions";
import ContractForm from "@/components/ContractForm";
import { Badge, CurrencySelect, Field, Flash, Hidden, money } from "@/components/ui";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireManager();
  const fin = can.finance(user);
  const people = await all<any>("SELECT id,name,worker_type FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const { id } = await params; const sp = await searchParams;
  const c = await get<any>("SELECT * FROM clients WHERE id=?", Number(id));
  if (!c) notFound();
  const contacts = await all<any>("SELECT * FROM contacts WHERE client_id=?", c.id);
  const contracts = await all<any>("SELECT k.*, per.name AS person, a.id AS aid, pr.name AS project FROM contracts k LEFT JOIN assignments a ON a.client_contract_id=k.id LEFT JOIN people per ON per.id=a.person_id LEFT JOIN projects pr ON pr.id=a.project_id WHERE k.kind='client' AND k.client_id=? ORDER BY k.id DESC", c.id);
  const projects = await all<any>("SELECT p.*, (SELECT COUNT(*) FROM assignments a WHERE a.project_id=p.id) AS people FROM projects p WHERE p.client_id=? ORDER BY p.id DESC", c.id);
  const deals = await all<any>("SELECT * FROM deals WHERE client_id=?", c.id);
  const invoices = await all<any>("SELECT * FROM invoices WHERE client_id=? ORDER BY id DESC LIMIT 12", c.id);
  const back = `/clients/${c.id}`;
  return (
    <>
      <h2>{c.name}</h2><Flash sp={sp} />
      <form action={updateClient} className="row card">
        <Hidden name="rid" value={c.id} />
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
          <td><form action={deleteContact}><Hidden name="rid" value={x.id} /><Hidden name="_back" value={back} /><button className="danger sm">Remove</button></form></td></tr>)}
        {!contacts.length && <tr><td colSpan={5} className="muted">No contacts.</td></tr>}</tbody></table>
      <form action={addContact} className="row" style={{ marginTop: 8 }}>
        <Hidden name="client_id" value={c.id} />
        <Field label="Name"><input name="name" required /></Field><Field label="Role"><input name="role" /></Field>
        <Field label="Email"><input name="email" /></Field><Field label="Phone"><input name="phone" /></Field><button className="sec">Add contact</button>
      </form>

      <h3>Contracts</h3>
      <table><thead><tr><th>Contract</th><th>Person</th><th>Project</th><th>Period</th><th>Terms</th></tr></thead><tbody>
        {contracts.map((k) => <tr key={k.id}><td>{k.aid ? <Link href={`/assignments/${k.aid}`}>{k.title}</Link> : k.title}</td><td>{k.person}</td><td>{k.project}</td><td>{k.start_date ?? "?"} to {k.end_date ?? "open"}</td><td>{k.payment_terms}, net {k.net_days}, {k.currency}</td></tr>)}
        {!contracts.length && <tr><td colSpan={5} className="muted">No contracts yet.</td></tr>}</tbody></table>
      <h3 style={{ fontSize: 13 }}>New contract (one person per contract; a project can have several contracts)</h3>
      <ContractForm client={c} projects={projects} people={people} fin={fin} back={back} />

      <h3>Projects</h3>
      <table><thead><tr><th>Project</th><th>People</th><th>Status</th></tr></thead><tbody>
        {projects.map((p) => <tr key={p.id}><td><Link href={`/projects/${p.id}`}>{p.name}</Link></td><td>{p.people}</td><td><Badge v={p.status} /></td></tr>)}
        {!projects.length && <tr><td colSpan={3} className="muted">No projects.</td></tr>}</tbody></table>
      <form action={addProject} className="row" style={{ marginTop: 8 }}>
        <Hidden name="client_id" value={c.id} />
        <Field label="Project name"><input name="name" required /></Field>
        <Field label="Start"><input type="date" name="start_date" /></Field>
        <button className="sec">Add empty project</button>
      </form>

      {!!deals.length && <><h3>Deals</h3><table><tbody>{deals.map((d) => <tr key={d.id}><td>{d.title}</td><td><Badge v={d.stage} /></td><td className="num">{money(d.value, d.currency)}</td></tr>)}</tbody></table></>}
      {!!invoices.length && <><h3>Recent invoices</h3><table><tbody>{invoices.map((i) => <tr key={i.id}><td><Link href={`/invoices/${i.id}`}>{i.number ?? `Draft #${i.id}`}</Link></td><td>{i.period}</td><td><Badge v={i.status} /></td><td className="num">{money(i.total, i.currency)}</td></tr>)}</tbody></table></>}
    </>
  );
}
