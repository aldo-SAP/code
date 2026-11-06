import { all } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/auth";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
/** Issued and paid invoices of one month, one row per line: what an accountant needs. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !can.manage(u)) return new Response("Forbidden", { status: 403 });
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) return new Response("Bad month", { status: 400 });
  const rows = await all<any>(`SELECT i.number, i.status, i.issue_date, i.due_date, i.currency, c.name AS client, c.country, l.description, l.quantity, l.unit, l.unit_price, l.amount, i.total
    FROM invoices i JOIN clients c ON c.id=i.client_id LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE i.period=? AND i.status IN ('issued','paid') ORDER BY i.number, l.id`, period);
  const head = ["invoice", "status", "issue_date", "due_date", "client", "country", "currency", "description", "quantity", "unit", "unit_price", "line_amount", "invoice_total"];
  const out = [head.join(","), ...rows.map((r) => [r.number, r.status, r.issue_date, r.due_date, r.client, r.country, r.currency, r.description, r.quantity, r.unit, r.unit_price, r.amount, r.total].map(q).join(","))];
  return new Response("﻿" + out.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="invoices-${period}.csv"` } });
}
