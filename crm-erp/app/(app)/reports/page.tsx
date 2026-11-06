import { requireAdmin } from "@/lib/session";
import { marginReport } from "@/lib/invoicing";
import { Field, money, thisMonth } from "@/components/ui";
import { fmtMonth } from "@/lib/dates";
import DataTable, { type Row } from "@/components/DataTable";
import PageHead from "@/components/PageHead";

export default async function Reports({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin();
  const period = (await searchParams).period ?? thisMonth();
  const m = await marginReport(period);
  const pct = (r: number, c: number) => (r ? `${Math.round(((r - c) / r) * 100)}%` : "-");
  const rows: Row[] = m.rows.map((r) => ({ id: r.assignment_id, project: r.project, person: r.person, revenue: { t: money(r.revenue), s: r.revenue }, cost: { t: money(r.cost), s: r.cost }, margin: { t: money(r.margin), s: r.margin }, pct: { t: pct(r.revenue, r.cost), s: r.revenue ? (r.revenue - r.cost) / r.revenue : -1 } }));
  return (
    <>
      <PageHead title={`Margin ${fmtMonth(period)}`} sub="Invoiced revenue minus payout cost." />
      <form className="row bar"><Field label="Month"><input type="month" name="period" defaultValue={period} /></Field><button className="sec">Show</button>
        <span className="muted">In EUR (other currencies converted with the latest rate in Settings). Includes drafts.</span></form>
      {m.warnings.map((w) => <div className="flash err" key={w}>{w}</div>)}
      <DataTable key={period} rows={rows} empty="Generate invoices and payouts for this month first." foot={["Total", "", { t: money(m.revenue), s: m.revenue }, { t: money(m.cost), s: m.cost }, { t: money(m.revenue - m.cost), s: m.revenue - m.cost }, pct(m.revenue, m.cost)]}
        cols={[{ key: "project", label: "Project" }, { key: "person", label: "Assigned person", filter: "select" }, { key: "revenue", label: "Revenue", num: true, filter: "none" }, { key: "cost", label: "Cost", num: true, filter: "none" }, { key: "margin", label: "Margin", num: true, filter: "none" }, { key: "pct", label: "%", num: true, filter: "none" }]} />
    </>
  );
}
