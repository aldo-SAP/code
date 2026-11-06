import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { addClient } from "@/app/actions";
import { Badge, CurrencySelect, Field, Flash } from "@/components/ui";

export default async function Clients({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const rows = await all<any>(`SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.status='active') AS projects FROM clients c ORDER BY c.name`);
  return (
    <>
      <h2>Clients</h2><Flash sp={sp} />
      <div className="tw"><table>
        <thead><tr><th>Name</th><th>Country</th><th>Currency</th><th>Active projects</th><th>Status</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td><Link href={`/clients/${c.id}`}>{c.name}</Link></td><td>{c.country}</td><td>{c.currency}</td><td>{c.projects}</td><td><Badge v={c.status} /></td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="muted">No clients yet.</td></tr>}</tbody>
      </table></div>
      <h3>New client</h3>
      <form action={addClient} className="row card">
        <Field label="Name"><input name="name" required /></Field>
        <Field label="Country"><input name="country" /></Field>
        <Field label="Billing email"><input name="email" type="email" /></Field>
        <Field label="Invoice currency"><CurrencySelect /></Field>
        <button>Add client</button>
      </form>
    </>
  );
}
