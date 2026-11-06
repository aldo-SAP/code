import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { runInvoices } from "@/app/actions";
import { Badge, Field, Flash, money, thisMonth } from "@/components/ui";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; period?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const period = sp.period ?? thisMonth();
  const rows = all<any>("SELECT i.*, c.name AS client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.period=? ORDER BY c.name, i.id", period);
  const open = all<any>("SELECT i.*, c.name AS client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status='issued' AND i.period<>? ORDER BY i.due_date", period);
  return (
    <>
      <h2>Invoices</h2><Flash sp={sp} />
      <div className="card">
        <form action={runInvoices} className="row">
          <Field label="Billing month"><input type="month" name="period" defaultValue={period} required /></Field>
          <button>Generate draft invoices</button>
          <span className="muted">Uses approved hours and approved milestones that are not invoiced yet. Existing drafts for the month are rebuilt; issued invoices are never touched.</span>
        </form>
        <form className="row" style={{ marginTop: 8 }}><Field label="View month"><input type="month" name="period" defaultValue={period} /></Field><button className="sec">Show</button></form>
      </div>
      <table><thead><tr><th>Number</th><th>Client</th><th>Status</th><th>Due</th><th className="num">Total</th></tr></thead><tbody>
        {rows.map((i) => <tr key={i.id}><td><Link href={`/invoices/${i.id}`}>{i.number ?? `Draft #${i.id}`}</Link></td><td>{i.client}</td><td><Badge v={i.status} /></td><td>{i.due_date}</td><td className="num">{money(i.total, i.currency)}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="muted">No invoices for {period}.</td></tr>}</tbody></table>
      {!!open.length && <><h3>Issued, unpaid (other months)</h3><table><tbody>{open.map((i) => <tr key={i.id}><td><Link href={`/invoices/${i.id}`}>{i.number}</Link></td><td>{i.client}</td><td>{i.period}</td><td>due {i.due_date}</td><td className="num">{money(i.total, i.currency)}</td></tr>)}</tbody></table></>}
    </>
  );
}
