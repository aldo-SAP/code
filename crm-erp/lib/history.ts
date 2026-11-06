import { all, get, run, tx } from "./db.ts";
import { audit, type Actor } from "./audit.ts";
import { generateInvoices, generatePayouts, voidInvoice } from "./invoicing.ts";

export interface BilledEntry {
  id: number; work_date: string; hours: number; worker: string; project: string;
  invoice_id: number | null; invoice_number: string | null; invoice_status: string | null; invoice_period: string | null;
  payout_id: number | null; payout_status: string | null; payout_period: string | null;
}

/** Entries that are already part of an invoice or payout. */
export function billedEntries(where: string, ...params: (string | number)[]): BilledEntry[] {
  return all<BilledEntry>(
    `SELECT t.id, t.work_date, t.hours, w.name AS worker, pr.name AS project,
            t.invoice_id, i.number AS invoice_number, i.status AS invoice_status, i.period AS invoice_period,
            t.payout_id, p.status AS payout_status, p.period AS payout_period
     FROM timesheet_entries t JOIN people w ON w.id=t.worker_id JOIN assignments a ON a.id=t.assignment_id JOIN projects pr ON pr.id=a.project_id
     LEFT JOIN invoices i ON i.id=t.invoice_id LEFT JOIN payouts p ON p.id=t.payout_id
     WHERE (t.invoice_id IS NOT NULL OR t.payout_id IS NOT NULL) AND ${where} ORDER BY t.work_date, w.name`, ...params);
}

/** Latest worked date already invoiced or paid out on an assignment (or null). */
export function billedThrough(assignmentId: number): string | null {
  return get<{ d: string | null }>("SELECT MAX(work_date) d FROM timesheet_entries WHERE assignment_id=? AND (invoice_id IS NOT NULL OR payout_id IS NOT NULL)", assignmentId)?.d ?? null;
}

export type Reopen = { ok: true; reopened: number; voided: string[]; revertedPayouts: number[] } | { ok: false; error: string };

/**
 * Reopen hours that are already billed. Rules:
 *  - paid invoices and paid payouts can never be reopened (issue a correction instead),
 *  - issued invoices / approved payouts need an admin,
 *  - a reason is mandatory; everything is written to the audit log.
 * Draft invoices/payouts are simply rebuilt without the reopened hours. An issued invoice is voided (kept, marked void).
 */
export function reopenBilled(actor: Actor & { admin: boolean }, entryIds: number[], reason: string): Reopen {
  if (reason.trim().length < 5) return { ok: false, error: "Write a reason (at least 5 characters)." };
  if (!entryIds.length) return { ok: false, error: "Select at least one day." };
  const rows = billedEntries(`t.id IN (${entryIds.map(() => "?").join(",")})`, ...entryIds);
  if (!rows.length) return { ok: false, error: "Those days are not billed, nothing to reopen." };
  if (rows.some((r) => r.invoice_status === "paid")) return { ok: false, error: "Some days belong to a PAID invoice. Paid invoices cannot be reopened; issue a correction instead." };
  if (rows.some((r) => r.payout_status === "paid")) return { ok: false, error: "Some days were already PAID OUT. They cannot be reopened; correct it in a later payout instead." };
  if (!actor.admin && rows.some((r) => r.invoice_status === "issued" || r.payout_status === "approved"))
    return { ok: false, error: "Only an admin can reopen hours on an issued invoice or an approved payout." };

  const voided: string[] = [], reverted: number[] = [];
  tx(() => {
    const draftInvoicePeriods = new Set<string>(), draftPayoutPeriods = new Set<string>();
    for (const id of new Set(rows.filter((r) => r.invoice_id).map((r) => r.invoice_id!))) {
      const r = rows.find((x) => x.invoice_id === id)!;
      if (r.invoice_status === "issued") { voidInvoice(id); voided.push(r.invoice_number ?? `#${id}`); }
      else if (r.invoice_status === "draft") draftInvoicePeriods.add(r.invoice_period!);
    }
    for (const id of new Set(rows.filter((r) => r.payout_id).map((r) => r.payout_id!))) {
      const r = rows.find((x) => x.payout_id === id)!;
      if (r.payout_status === "approved") { run("UPDATE payouts SET status='draft' WHERE id=?", id); reverted.push(id); }
      draftPayoutPeriods.add(r.payout_period!);
    }
    for (const r of rows) run("UPDATE timesheet_entries SET status='draft', invoice_id=NULL, payout_id=NULL WHERE id=?", r.id);
    for (const p of draftInvoicePeriods) generateInvoices(p);
    for (const p of draftPayoutPeriods) generatePayouts(p);
    audit(actor, "reopen_billed_hours", "timesheet", null,
      `Reopened ${rows.length} billed day(s)${voided.length ? `; voided invoice ${voided.join(", ")}` : ""}${reverted.length ? `; payout(s) ${reverted.join(", ")} back to draft` : ""}`,
      { reason, details: { voidedInvoices: voided, revertedPayouts: reverted, entries: rows.map((r) => ({ id: r.id, date: r.work_date, hours: r.hours, worker: r.worker, project: r.project, invoice: r.invoice_number ?? r.invoice_id, invoiceStatus: r.invoice_status, payoutStatus: r.payout_status })) } });
  });
  return { ok: true, reopened: rows.length, voided, revertedPayouts: reverted };
}
