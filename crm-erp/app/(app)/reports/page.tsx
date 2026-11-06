import { requireAdmin } from "@/lib/session";
import { marginReport } from "@/lib/invoicing";
import { Field, money, thisMonth } from "@/components/ui";
import { fmtMonth } from "@/lib/dates";

export default async function Reports({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const period = (await searchParams).period ?? thisMonth();
  const m = await marginReport(period);
  const pct = (r: number, c: number) => (r ? `${Math.round(((r - c) / r) * 100)}%` : "-");
  return (
    <>
      <h1>Margin {fmtMonth(period)}</h1>
      <form className="row bar"><Field label="Month"><input type="month" name="period" defaultValue={period} /></Field><button className="sec">Show</button>
        <span className="muted">Invoiced revenue minus payout cost, in EUR (other currencies converted with the latest rate in Settings). Includes drafts.</span></form>
      {m.warnings.map((w) => <div className="flash err" key={w}>{w}</div>)}
      <table><thead><tr><th>Project</th><th>Assigned person</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Margin</th><th className="num">%</th></tr></thead><tbody>
        {m.rows.map((r) => <tr key={r.assignment_id}><td>{r.project}</td><td>{r.person}</td><td className="num">{money(r.revenue)}</td><td className="num">{money(r.cost)}</td><td className="num">{money(r.margin)}</td><td className="num">{pct(r.revenue, r.cost)}</td></tr>)}
        {!m.rows.length && <tr><td colSpan={6} className="muted">Generate invoices and payouts for this month first.</td></tr>}</tbody>
        <tfoot><tr><td colSpan={2}><b>Total</b></td><td className="num"><b>{money(m.revenue)}</b></td><td className="num"><b>{money(m.cost)}</b></td><td className="num"><b>{money(m.revenue - m.cost)}</b></td><td className="num">{pct(m.revenue, m.cost)}</td></tr></tfoot></table>
    </>
  );
}
