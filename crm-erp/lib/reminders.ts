import { all, get } from "./db.ts";
import { periodRange } from "./billing.ts";
import { sendMail } from "./mail.ts";
import { fmtMonth } from "./dates.ts";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export type HoursState = "nothing" | "draft" | "waiting" | "done";
export interface PersonHours { personId: number; name: string; email: string | null; state: HoursState; draftHours: number; submittedHours: number; approvedHours: number; lastReminder: string | null }
export interface Checklist { period: string; needSubmit: number; waitingApproval: number; approvedNotInvoiced: number; draftInvoices: number; issuedUnpaid: number; draftPayouts: number }

/** Where each person with an active assignment stands on this month's hours. "nothing"/"draft" need a reminder. */
export async function monthStatus(period: string): Promise<PersonHours[]> {
  const { start, end } = periodRange(period);
  const people = await all<any>(
    `SELECT DISTINCT p.id, p.name, p.email FROM assignments a JOIN people p ON p.id=a.person_id JOIN projects pr ON pr.id=a.project_id
     WHERE a.start_date<=? AND (a.end_date IS NULL OR a.end_date>=?) AND pr.status<>'done' AND p.stage IN ('ready','placed') ORDER BY p.name`, end, start);
  const rows = await all<any>("SELECT worker_id, status, SUM(hours) AS h FROM timesheet_entries WHERE work_date BETWEEN ? AND ? GROUP BY worker_id, status", start, end);
  const sent = await all<any>("SELECT related, MAX(created_at) AS at FROM email_outbox WHERE related LIKE ? GROUP BY related", `reminder:${period}:%`);
  return people.map((p) => {
    const h = (st: string[]) => rows.filter((r) => r.worker_id === p.id && st.includes(r.status)).reduce((a, r) => a + Number(r.h), 0);
    const draft = h(["draft", "rejected"]), sub = h(["submitted"]), appr = h(["approved"]);
    const state: HoursState = draft > 0 ? "draft" : sub > 0 ? "waiting" : appr > 0 ? "done" : "nothing";
    return { personId: p.id, name: p.name, email: p.email, state, draftHours: draft, submittedHours: sub, approvedHours: appr, lastReminder: sent.find((s) => s.related === `reminder:${period}:${p.id}`)?.at ?? null };
  });
}

export async function checklist(period: string): Promise<Checklist> {
  const { start, end } = periodRange(period);
  const n = async (sql: string, ...p: any[]) => Number((await get<any>(sql, ...p))?.n ?? 0);
  return {
    period,
    needSubmit: (await monthStatus(period)).filter((p) => p.state === "nothing" || p.state === "draft").length,
    waitingApproval: await n("SELECT COUNT(*) AS n FROM timesheet_entries WHERE status='submitted' AND work_date BETWEEN ? AND ?", start, end),
    approvedNotInvoiced: await n("SELECT COUNT(*) AS n FROM timesheet_entries WHERE status='approved' AND invoice_id IS NULL AND payout_id IS NULL AND work_date BETWEEN ? AND ?", start, end),
    draftInvoices: await n("SELECT COUNT(*) AS n FROM invoices WHERE status='draft' AND period=?", period),
    issuedUnpaid: await n("SELECT COUNT(*) AS n FROM invoices WHERE status='issued'"),
    draftPayouts: await n("SELECT COUNT(*) AS n FROM payouts WHERE status='draft' AND period=?", period),
  };
}

/** Email the people who still owe hours. Nobody gets two reminders for the same month within `minDays` days. */
export async function sendReminders(period: string, opts: { personIds?: number[]; minDays?: number; now?: Date } = {}): Promise<{ sent: string[]; skipped: string[] }> {
  const minDays = opts.minDays ?? 3, now = opts.now ?? new Date();
  const sent: string[] = [], skipped: string[] = [];
  for (const p of await monthStatus(period)) {
    if (opts.personIds && !opts.personIds.includes(p.personId)) continue;
    if (p.state !== "nothing" && p.state !== "draft") continue;
    if (!p.email) { skipped.push(`${p.name} (no email)`); continue; }
    if (p.lastReminder && now.getTime() - new Date(p.lastReminder.replace(" ", "T") + "Z").getTime() < minDays * 86400000) { skipped.push(`${p.name} (reminded recently)`); continue; }
    const what = p.state === "draft" ? `You have ${p.draftHours} hours saved but not submitted.` : "We have not received any hours from you yet.";
    await sendMail({ to: [p.email], subject: `Please submit your hours for ${fmtMonth(period)}`, related: `reminder:${period}:${p.personId}`,
      text: `Hi ${p.name},\n\n${what}\nPlease fill in and submit your timesheet for ${fmtMonth(period)} so it can be approved and invoiced on time.\n\n${appUrl()}/timesheets?period=${period}` });
    sent.push(p.name);
  }
  return { sent, skipped };
}
