import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { runInvoices } from "@/app/actions";
import { Field, Flash, money, thisMonth } from "@/components/ui";
import { fmtDate, fmtMonth } from "@/lib/dates";
import DataTable, { type Row } from "@/components/DataTable";
import PageHead from "@/components/PageHead";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; period?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const period = sp.period ?? thisMonth();
  const list = await all<any>("SELECT i.*, c.name AS client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.period=? ORDER BY c.name, i.id", period);
  const open = await all<any>("SELECT i.*, c.name AS client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.status='issued' AND i.period<>? ORDER BY i.due_date", period);
  const rows: Row[] = list.map((i) => ({ id: i.id, number: { t: i.number ?? `Draft #${i.id}`, href: `/invoices/${i.id}` }, client: i.client, status: { t: i.status, badge: true }, due: { t: i.due_date ? fmtDate(i.due_date) : "-", s: i.due_date ?? "" }, total: { t: money(i.total, i.currency), s: i.total } }));
  const openRows: Row[] = open.map((i) => ({ id: i.id, number: { t: i.number, href: `/invoices/${i.id}` }, client: i.client, period: i.period, due: { t: fmtDate(i.due_date), s: i.due_date ?? "" }, total: { t: money(i.total, i.currency), s: i.total } }));
  return (
    <>
      <PageHead title="Invoices" sub={`Invoices for ${fmtMonth(period)}.`}>
        <a className="btn sec" href={`/invoices/export?period=${period}`}>Download for accountant (CSV)</a>
      </PageHead>
      <Flash sp={sp} />
      <div className="card">
        <form action={runInvoices} className="row">
          <Field label="Billing month"><input type="month" name="period" defaultValue={period} required /></Field>
          <button>Generate draft invoices</button>
          <span className="muted">Uses approved hours and approved milestones that are not invoiced yet. Existing drafts for the month are rebuilt; issued invoices are never touched.</span>
        </form>
        <form className="row" style={{ marginTop: 8 }}><Field label="View month"><input type="month" name="period" defaultValue={period} /></Field><button className="sec">Show</button></form>
      </div>
      <DataTable key={period} rows={rows} empty={`No invoices for ${period}. Generate drafts above.`}
        cols={[{ key: "number", label: "Number" }, { key: "client", label: "Client", filter: "select" }, { key: "status", label: "Status", filter: "select" }, { key: "due", label: "Due", filter: "none" }, { key: "total", label: "Total", num: true, filter: "none" }]} />
      {!!openRows.length && <>
        <h2>Issued, unpaid (other months)</h2>
        <DataTable rows={openRows} initialSort={[{ id: "due", desc: false }]}
          cols={[{ key: "number", label: "Number" }, { key: "client", label: "Client", filter: "select" }, { key: "period", label: "Month", filter: "select" }, { key: "due", label: "Due", filter: "none" }, { key: "total", label: "Total", num: true, filter: "none" }]} />
      </>}
    </>
  );
}
