import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, setting } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { issueInv, payInv, voidInv } from "@/app/actions";
import PrintButton from "@/components/PrintButton";
import { Badge, Flash, Hidden, money, num } from "@/components/ui";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const { id } = await params; const sp = await searchParams;
  const inv = get<any>("SELECT i.*, c.name AS client, c.address, c.country, c.email FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=?", Number(id));
  if (!inv) notFound();
  const lines = all<any>("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY project_id, id", inv.id);
  const unit = (l: any) => ({ h: "hours", day: "days", month: "month", fixed: "fixed" }[l.unit as string] ?? l.unit);
  return (
    <>
      <div className="no-print"><Flash sp={sp} />
        <div className="bar">
          <Link href={`/invoices?period=${inv.period}`}>&larr; Invoices</Link><Badge v={inv.status} />
          {inv.status === "draft" && <form action={issueInv}><Hidden name="id" value={inv.id} /><button>Issue (assign number)</button></form>}
          {inv.status === "issued" && <form action={payInv}><Hidden name="id" value={inv.id} /><button>Mark paid</button></form>}
          {(inv.status === "draft" || inv.status === "issued") && <form action={voidInv}><Hidden name="id" value={inv.id} /><button className="danger">{inv.status === "draft" ? "Discard draft" : "Void"}</button></form>}
          <a className="btn sec" href={`/invoices/${inv.id}/csv`}>Download CSV</a>
          <PrintButton />
        </div>
      </div>
      <div className="invoice">
        <h2 style={{ marginBottom: 2 }}>{inv.status === "draft" ? "DRAFT invoice" : `Invoice ${inv.number}`}</h2>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, margin: "14px 0" }}>
          <div><b>{setting("company_name", "Your company")}</b><br /><span style={{ whiteSpace: "pre-line" }}>{setting("company_address")}</span><br />{setting("company_vat_or_reg")}</div>
          <div><b>Bill to</b><br />{inv.client}<br /><span style={{ whiteSpace: "pre-line" }}>{inv.address}</span><br />{inv.country}</div>
          <div>Period: {inv.period}<br />Issued: {inv.issue_date ?? "-"}<br />Due: {inv.due_date ?? `${inv.net_days} days after issue`}<br />Currency: {inv.currency}</div>
        </div>
        <table><thead><tr><th>Description</th><th className="num">Quantity</th><th className="num">Unit price</th><th className="num">Amount</th><th className="no-print">Internal detail</th></tr></thead><tbody>
          {lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{num(l.quantity)} {unit(l)}</td><td className="num">{money(l.unit_price, inv.currency)}</td><td className="num">{money(l.amount, inv.currency)}</td><td className="no-print muted">{l.detail}</td></tr>)}
        </tbody><tfoot><tr><td colSpan={3} className="num"><b>Total</b></td><td className="num"><b>{money(inv.total, inv.currency)}</b></td><td className="no-print" /></tr></tfoot></table>
        <p style={{ marginTop: 18 }}>Payment to: {setting("company_iban", "-")}</p>
      </div>
    </>
  );
}
