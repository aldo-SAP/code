import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, setting } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { issueInv, payInv, voidInv } from "@/app/actions";
import PrintButton from "@/components/PrintButton";
import { auditFor } from "@/lib/audit";
import { can } from "@/lib/auth";
import { Badge, Flash, Hidden, money, num } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/dates";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireManager();
  const { id } = await params; const sp = await searchParams;
  const inv = await get<any>("SELECT i.*, c.name AS client, c.address, c.country, c.email FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=?", Number(id));
  if (!inv) notFound();
  const lines = await all<any>("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY project_id, id", inv.id);
  const unit = (l: any) => ({ h: "hours", day: "days", month: "month", fixed: "fixed" }[l.unit as string] ?? l.unit);
  return (
    <>
      <div className="no-print"><Flash sp={sp} />
        <div className="bar">
          <Link href={`/invoices?period=${inv.period}`}>&larr; Invoices</Link><Badge v={inv.status} />
          {inv.status === "draft" && <form action={issueInv}><Hidden name="rid" value={inv.id} /><button>Issue (assign number)</button></form>}
          {inv.status === "issued" && <form action={payInv}><Hidden name="rid" value={inv.id} /><button>Mark paid</button></form>}
          {inv.status === "draft" && <form action={voidInv}><Hidden name="rid" value={inv.id} /><button className="danger">Discard draft</button></form>}
          {inv.status !== "void" && <Link className="btn sec" href={`/unlock?invoice=${inv.id}`}>Reopen hours of this invoice</Link>}
          <a className="btn sec" href={`/invoices/${inv.id}/csv`}>Download CSV</a>
          <PrintButton />
        </div>
      </div>
      {inv.status === "issued" && can.admin(user) && (
        <form action={voidInv} className="row card no-print">
          <Hidden name="rid" value={inv.id} />
          <b>Void this issued invoice</b>
          <input aria-label="Reason (required)" name="reason" placeholder="Reason (required)" minLength={5} required style={{ minWidth: 240 }} />
          <input aria-label="Type VOID" name="confirm" placeholder="Type VOID" required autoComplete="off" style={{ width: 110 }} />
          <button className="danger">Void invoice</button>
        </form>
      )}
      <div className="invoice">
        {/^https:\/\//.test(await setting("company_logo_url", "")) && <img src={await setting("company_logo_url")} alt="" style={{ maxHeight: 56, maxWidth: 220, marginBottom: 10 }} />}
        <h1 style={{ marginBottom: 2 }}>{inv.status === "draft" ? "DRAFT invoice" : `Invoice ${inv.number}`}</h1>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, margin: "14px 0" }}>
          <div><b>{await setting("company_name", "Your company")}</b><br /><span style={{ whiteSpace: "pre-line" }}>{await setting("company_address")}</span><br />{await setting("company_vat_or_reg")}</div>
          <div><b>Bill to</b><br />{inv.client}<br /><span style={{ whiteSpace: "pre-line" }}>{inv.address}</span><br />{inv.country}</div>
          <div>Period: {fmtMonth(inv.period)}<br />Issued: {inv.issue_date ? fmtDate(inv.issue_date) : "-"}<br />Due: {inv.due_date ? fmtDate(inv.due_date) : `${inv.net_days} days after issue`}<br />Currency: {inv.currency}</div>
        </div>
        <table><thead><tr><th>Description</th><th className="num">Quantity</th><th className="num">Unit price</th><th className="num">Amount</th><th className="no-print">Internal detail</th></tr></thead><tbody>
          {lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{num(l.quantity)} {unit(l)}</td><td className="num">{money(l.unit_price, inv.currency)}</td><td className="num">{money(l.amount, inv.currency)}</td><td className="no-print muted">{l.detail}</td></tr>)}
        </tbody><tfoot><tr><td colSpan={3} className="num"><b>Total</b></td><td className="num"><b>{money(inv.total, inv.currency)}</b></td><td className="no-print" /></tr></tfoot></table>
        <p style={{ marginTop: 18 }}>Payment to: {await setting("company_iban", "-")}</p>
        {(await setting("company_footer", "")) && <p className="muted" style={{ whiteSpace: "pre-line" }}>{await setting("company_footer")}</p>}
      </div>
      <div className="no-print">
        <h2>History</h2>
        <table><tbody>
          {(await auditFor("invoice", inv.id)).map((h) => <tr key={h.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(h.created_at)}</td><td>{h.user_name}</td><td>{h.summary}{h.reason ? <span className="muted"> - {h.reason}</span> : null}</td></tr>)}
          {!(await auditFor("invoice", inv.id)).length && <tr><td className="muted">No logged actions.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}