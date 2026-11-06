import { all, get } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/auth";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !can.manage(u)) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const inv = get<any>("SELECT i.*, c.name AS client FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.id=?", Number(id));
  if (!inv) return new Response("Not found", { status: 404 });
  const lines = all<any>("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY id", inv.id);
  const out = [["invoice", "client", "period", "currency", "description", "quantity", "unit", "unit_price", "amount"].join(",")];
  for (const l of lines) out.push([inv.number ?? `draft-${inv.id}`, inv.client, inv.period, inv.currency, l.description, l.quantity, l.unit, l.unit_price, l.amount].map(q).join(","));
  return new Response(out.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="invoice-${inv.number ?? "draft-" + inv.id}.csv"` } });
}
