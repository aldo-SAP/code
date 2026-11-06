import Link from "next/link";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { runPayouts } from "@/app/actions";
import { Badge, Field, Flash, money, thisMonth } from "@/components/ui";

export default async function Payouts({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; period?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const period = sp.period ?? thisMonth();
  const rows = await all<any>("SELECT p.*, per.name FROM payouts p JOIN people per ON per.id=p.person_id WHERE p.period=? ORDER BY p.kind, per.name", period);
  return (
    <>
      <h2>Payouts</h2><Flash sp={sp} />
      <div className="card">
        <form action={runPayouts} className="row"><Field label="Month"><input type="month" name="period" defaultValue={period} required /></Field><button>Generate draft payouts</button>
          <span className="muted">External people: statement they invoice us from. Internal people: payroll cost. Substitutes are paid at the cost rate on the substitution.</span></form>
        <form className="row" style={{ marginTop: 8 }}><Field label="View month"><input type="month" name="period" defaultValue={period} /></Field><button className="sec">Show</button></form>
      </div>
      <table><thead><tr><th>Person</th><th>Kind</th><th>Status</th><th className="num">Total</th></tr></thead><tbody>
        {rows.map((p) => <tr key={p.id}><td><Link href={`/payouts/${p.id}`}>{p.name}</Link></td><td>{p.kind}</td><td><Badge v={p.status} /></td><td className="num">{money(p.total, p.currency)}</td></tr>)}
        {!rows.length && <tr><td colSpan={4} className="muted">No payouts for {period}.</td></tr>}</tbody></table>
    </>
  );
}
