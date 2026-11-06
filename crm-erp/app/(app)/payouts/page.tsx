import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { runPayouts } from "@/app/actions";
import { Field, Flash, money, thisMonth } from "@/components/ui";
import { fmtMonth } from "@/lib/dates";
import DataTable, { type Row } from "@/components/DataTable";
import PageHead from "@/components/PageHead";

export default async function Payouts({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; period?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const period = sp.period ?? thisMonth();
  const list = await all<any>("SELECT p.*, per.name FROM payouts p JOIN people per ON per.id=p.person_id WHERE p.period=? ORDER BY p.kind, per.name", period);
  const rows: Row[] = list.map((p) => ({ id: p.id, person: { t: p.name, href: `/payouts/${p.id}` }, kind: p.kind, status: { t: p.status, badge: true }, total: { t: money(p.total, p.currency), s: p.total } }));
  return (
    <>
      <PageHead title="Payouts" sub={`What you owe people for ${fmtMonth(period)}.`} />
      <Flash sp={sp} />
      <div className="card">
        <form action={runPayouts} className="row"><Field label="Month"><input type="month" name="period" defaultValue={period} required /></Field><button>Generate draft payouts</button>
          <span className="muted">External people: statement they invoice us from. Internal people: payroll cost. Substitutes are paid at the cost rate on the substitution.</span></form>
        <form className="row" style={{ marginTop: 8 }}><Field label="View month"><input type="month" name="period" defaultValue={period} /></Field><button className="sec">Show</button></form>
      </div>
      <DataTable key={period} rows={rows} empty={`No payouts for ${period}. Generate drafts above.`}
        cols={[{ key: "person", label: "Person" }, { key: "kind", label: "Kind", filter: "select" }, { key: "status", label: "Status", filter: "select" }, { key: "total", label: "Total", num: true, filter: "none" }]} />
    </>
  );
}
