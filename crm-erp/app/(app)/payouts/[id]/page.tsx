import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { setPayout } from "@/app/actions";
import PrintButton from "@/components/PrintButton";
import { Badge, Hidden, money, num } from "@/components/ui";

export default async function PayoutPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const p = get<any>("SELECT p.*, per.name, per.worker_type FROM payouts p JOIN people per ON per.id=p.person_id WHERE p.id=?", Number(id));
  if (!p) notFound();
  const lines = all<any>("SELECT * FROM payout_lines WHERE payout_id=? ORDER BY id", p.id);
  const set = (status: string, label: string) => <form action={setPayout}><Hidden name="id" value={p.id} /><Hidden name="_back" value={`/payouts/${p.id}`} /><button name="status" value={status} className="sec">{label}</button></form>;
  return (
    <>
      <div className="bar no-print"><Link href={`/payouts?period=${p.period}`}>&larr; Payouts</Link><Badge v={p.status} />
        {p.status === "draft" && set("approved", "Approve")}{p.status === "approved" && set("paid", "Mark paid")}{p.status !== "draft" && set("draft", "Back to draft")}<PrintButton /></div>
      <div className="invoice">
        <h2>{p.kind === "payroll" ? "Payroll cost statement" : "Contractor statement"}: {p.name}</h2>
        <p>Period {p.period} · {p.currency}{p.kind === "contractor" ? " · the contractor invoices us for this total" : " · internal, paid through payroll"}</p>
        <table><thead><tr><th>Description</th><th className="num">Quantity</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead><tbody>
          {lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{num(l.quantity)} {l.unit}</td><td className="num">{money(l.unit_price, p.currency)}</td><td className="num">{money(l.amount, p.currency)}</td></tr>)}
        </tbody><tfoot><tr><td colSpan={3} className="num"><b>Total</b></td><td className="num"><b>{money(p.total, p.currency)}</b></td></tr></tfoot></table>
      </div>
    </>
  );
}
