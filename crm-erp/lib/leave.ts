import { all, get, run, setting } from "./db.ts";
import { audit } from "./audit.ts";
import { sendMail } from "./mail.ts";
import { personHolidays, workingDaysWith } from "./holidays.ts";
import { fmtRange } from "./dates.ts";
import type { User } from "./auth.ts";

export type LeaveType = "vacation" | "sick" | "holiday" | "other";
export const LEAVE_TYPES: LeaveType[] = ["vacation", "sick", "holiday", "other"];
type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const isManager = (u: Pick<User, "role">) => u.role === "admin" || u.role === "manager";
/** Workers need approval for vacation and other leave. Sick days are reported (recorded at once, approvers are told). */
export const requiresApproval = (type: LeaveType, byManager: boolean) => !byManager && (type === "vacation" || type === "other");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const todayStr = () => new Date().toISOString().slice(0, 10);
const nowStr = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export async function approverEmails(excludeEmail?: string): Promise<string[]> {
  const configured = (await setting("leave_approver_emails")).split(/[,;\s]+/).filter(Boolean);
  const list = configured.length ? configured : (await all<{ email: string }>("SELECT email FROM users WHERE active=1 AND role IN ('admin','manager')")).map((r) => r.email);
  const others = list.filter((e) => e.toLowerCase() !== excludeEmail?.toLowerCase());
  return others.length ? others : list;
}

export async function personEmail(personId: number): Promise<string | null> {
  const u = await get<{ email: string }>("SELECT email FROM users WHERE person_id=? AND active=1", personId);
  if (u) return u.email;
  return (await get<{ email: string | null }>("SELECT email FROM people WHERE id=?", personId))?.email ?? null;
}

// ------------------------------------------------------------------ allowance and balance

/** Company default when nothing is set in Settings. */
export const DEFAULT_LEAVE_DAYS = 22;

export async function defaultAllowance(): Promise<number> {
  const v = Number(await setting("default_leave_days"));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_LEAVE_DAYS;
}
export async function allowanceFor(personId: number, year: number): Promise<number> {
  const r = await get<{ days: number }>("SELECT days FROM leave_allowance WHERE person_id=? AND year=?", personId, year);
  return r ? r.days : defaultAllowance();
}

export interface Balance { year: number; allowance: number; taken: number; planned: number; pending: number; remaining: number; remainingIfPending: number }

/** Working days of vacation in `year`: taken (up to and including today), planned (approved, later) and pending (not yet decided). */
export async function leaveBalance(personId: number, year: number, today = todayStr()): Promise<Balance> {
  const ys = `${year}-01-01`, ye = `${year}-12-31`;
  const rows = await all<{ from_date: string; to_date: string; status: string }>(
    "SELECT from_date,to_date,status FROM leave WHERE person_id=? AND type='vacation' AND status IN ('approved','requested') AND to_date>=? AND from_date<=?", personId, ys, ye);
  let taken = 0, planned = 0, pending = 0;
  const hol = await personHolidays(personId, ys, ye); // the person's own public holidays never use up vacation
  for (const r of rows) {
    const from = r.from_date > ys ? r.from_date : ys, to = r.to_date < ye ? r.to_date : ye;
    const total = workingDaysWith(from, to, hol);
    if (r.status === "requested") { pending += total; continue; }
    const used = to < today ? total : from > today ? 0 : workingDaysWith(from, today, hol);
    taken += used; planned += total - used;
  }
  const allowance = await allowanceFor(personId, year);
  return { year, allowance, taken, planned, pending, remaining: allowance - taken - planned, remainingIfPending: allowance - taken - planned - pending };
}

/** All leave of a person touching `year` (any status), oldest first, plus the balance. Used for the timeline. */
export async function leaveTimeline(personId: number, year: number) {
  const rows = await all<any>("SELECT * FROM leave WHERE person_id=? AND to_date>=? AND from_date<=? ORDER BY from_date, id", personId, `${year}-01-01`, `${year}-12-31`);
  return { rows, balance: await leaveBalance(personId, year) };
}

// ------------------------------------------------------------------ one email thread per request

interface LeaveRow { id: number; person_id: number; name: string; type: string; from_date: string; to_date: string; days: number }
const threadKey = (id: number) => `leave:${id}`;
const threadSubject = (l: Pick<LeaveRow, "name" | "from_date" | "to_date">) => `Leave request: ${l.name}, ${fmtRange(l.from_date, l.to_date)}`;

/** Message in the request's thread: to the approvers, copy to the employee. The first message opens the thread, later ones reply to it. */
async function threadMail(l: LeaveRow, text: string, opts: { exclude?: string } = {}) {
  const worker = await personEmail(l.person_id);
  await sendMail({ to: await approverEmails(opts.exclude), cc: worker ? [worker] : [], subject: threadSubject(l), text, thread: threadKey(l.id), related: threadKey(l.id) });
}

// ------------------------------------------------------------------ workflow

export interface LeaveInput { personId: number; type: LeaveType; from: string; to: string; notes?: string }

export async function createLeave(actor: User, i: LeaveInput): Promise<Result<{ id: number; status: "requested" | "approved"; warning?: string }>> {
  const manager = isManager(actor);
  if (!LEAVE_TYPES.includes(i.type)) return { ok: false, error: "Choose a leave type." };
  if (!isDate(i.from) || !isDate(i.to) || i.to < i.from) return { ok: false, error: "Check the dates: the end must not be before the start." };
  if (!manager && i.personId !== actor.person_id) return { ok: false, error: "You can only request leave for yourself." };
  if (i.type === "holiday" && !manager) return { ok: false, error: "Public holidays are recorded by a manager." };
  const person = await get<{ name: string }>("SELECT name FROM people WHERE id=?", i.personId);
  if (!person) return { ok: false, error: "Unknown person." };
  const hol = await personHolidays(i.personId, i.from, i.to);
  const days = workingDaysWith(i.from, i.to, hol);
  if (days === 0) return { ok: false, error: hol.size ? "That range has no working days (weekends and public holidays only)." : "That range has no working days (weekends only)." };
  if (!manager && (i.type === "vacation" || i.type === "other") && i.from < todayStr()) return { ok: false, error: "Vacation cannot start in the past. Ask a manager to record it." };
  const clash = await get<{ from_date: string; to_date: string; status: string }>(
    "SELECT from_date,to_date,status FROM leave WHERE person_id=? AND status IN ('requested','approved') AND from_date<=? AND to_date>=?", i.personId, i.to, i.from);
  if (clash) return { ok: false, error: `This overlaps with ${clash.status} leave on ${fmtRange(clash.from_date, clash.to_date)}.` };

  // vacation beyond the yearly allowance is allowed but flagged to the approver
  let warning: string | undefined;
  if (i.type === "vacation") {
    const year = Number(i.from.slice(0, 4));
    const b = await leaveBalance(i.personId, year);
    const inYear = workingDaysWith(i.from > `${year}-01-01` ? i.from : `${year}-01-01`, i.to < `${year}-12-31` ? i.to : `${year}-12-31`, hol);
    if (inYear > b.remainingIfPending) warning = `This is more than the ${year} allowance leaves (${plural(Math.max(0, b.remainingIfPending), "day")} left before this request).`;
  }

  const pending = requiresApproval(i.type, manager);
  const status = pending ? "requested" : "approved";
  const id = await run(
    `INSERT INTO leave (person_id,type,from_date,to_date,notes,status,days,requested_by,requested_at,decided_by,decided_by_name,decided_at,decision_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    i.personId, i.type, i.from, i.to, i.notes?.trim() || null, status, days, actor.id, nowStr(),
    pending ? null : manager ? actor.id : null, pending ? null : manager ? actor.name : "automatic", pending ? null : nowStr(), pending ? null : manager ? null : "Reported by the worker");
  await audit(actor, pending ? "leave_request" : "leave_record", "leave", id, `${person.name}: ${i.type} ${fmtRange(i.from, i.to)} (${plural(days, "working day")}) ${pending ? "requested" : "recorded"}`, { details: { notes: i.notes ?? null, warning: warning ?? null } });

  const l: LeaveRow = { id, person_id: i.personId, name: person.name, type: i.type, from_date: i.from, to_date: i.to, days };
  const range = `${fmtRange(i.from, i.to)} (${plural(days, "working day")})`;
  const link = `${appUrl()}/leave/${id}`;
  if (pending) {
    await threadMail(l, `${person.name} asks for ${i.type} leave.\n\nDates: ${range}\n${i.notes ? `Note: ${i.notes}\n` : ""}${warning ? `\nHeads up: ${warning}\n` : ""}\nOpen the request to approve or reject: ${link}\n\nThe decision will be sent as a reply in this thread.`, { exclude: actor.email });
  } else if (manager && i.personId !== actor.person_id) {
    const workerAddr = await personEmail(i.personId);
    if (workerAddr) await sendMail({ to: [workerAddr], cc: [actor.email], subject: threadSubject(l), thread: threadKey(id), related: threadKey(id),
      text: `Hi ${person.name},\n\n${actor.name} recorded ${i.type} leave for you: ${range}.\n\nSee it here: ${appUrl()}/leave` });
  } else if (!manager) {
    await threadMail(l, `${person.name} reported ${i.type} leave for ${range}.\n\nDetails: ${link}`);
  }
  return { ok: true, id, status, warning };
}

async function loadLeave(id: number) {
  return get<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.id=?", id);
}

export async function decideLeave(actor: User, id: number, decision: "approved" | "rejected", note: string): Promise<Result> {
  if (!isManager(actor)) return { ok: false, error: "Only a manager or admin can decide leave requests." };
  const l = await loadLeave(id);
  if (!l) return { ok: false, error: "Request not found." };
  if (l.status !== "requested") return { ok: false, error: `This request is already ${l.status}.` };
  if (l.person_id === actor.person_id) return { ok: false, error: "You cannot decide your own request. Ask another manager." };
  if (decision === "rejected" && note.trim().length < 3) return { ok: false, error: "Please give a short reason for rejecting." };
  await run("UPDATE leave SET status=?, decided_by=?, decided_by_name=?, decided_at=?, decision_note=? WHERE id=? AND status='requested'", decision, actor.id, actor.name, nowStr(), note.trim() || null, id);
  await audit(actor, decision === "approved" ? "leave_approve" : "leave_reject", "leave", id, `${decision === "approved" ? "Approved" : "Rejected"} ${l.type} leave for ${l.name}, ${fmtRange(l.from_date, l.to_date)}`, { reason: note.trim() || undefined });
  await threadMail(l, `${decision === "approved" ? "Approved" : "Rejected"} by ${actor.name}.\n${note.trim() ? `\nNote: ${note.trim()}\n` : ""}\n${l.name}: ${l.type} leave ${fmtRange(l.from_date, l.to_date)} (${plural(l.days, "working day")}).\n${appUrl()}/leave/${id}`);
  return { ok: true };
}

/**
 * Take back an approved leave because of project needs. The days return to the employee (they no longer count against the allowance)
 * and the employee and approvers are told in the same email thread. Only leave that has not started yet.
 */
export async function revokeLeave(actor: User, id: number, note: string): Promise<Result> {
  if (!isManager(actor)) return { ok: false, error: "Only a manager or admin can withdraw approved leave." };
  const l = await loadLeave(id);
  if (!l) return { ok: false, error: "Leave not found." };
  if (l.status !== "approved") return { ok: false, error: `Only approved leave can be withdrawn (this one is ${l.status}).` };
  if (l.person_id === actor.person_id) return { ok: false, error: "You cannot withdraw your own leave here. Use Cancel." };
  if (l.from_date < todayStr()) return { ok: false, error: "This leave has already started, so it cannot be withdrawn." };
  if (note.trim().length < 3) return { ok: false, error: "Please give the employee a reason." };
  await run("UPDATE leave SET status='revoked', decided_by=?, decided_by_name=?, decided_at=?, decision_note=? WHERE id=? AND status='approved'", actor.id, actor.name, nowStr(), note.trim(), id);
  await audit(actor, "leave_revoke", "leave", id, `Withdrew approved ${l.type} leave for ${l.name}, ${fmtRange(l.from_date, l.to_date)}`, { reason: note.trim() });
  await threadMail(l, `Update: ${actor.name} withdrew the approval of this leave.\n\nReason: ${note.trim()}\n\n${l.name}: ${l.type} leave ${fmtRange(l.from_date, l.to_date)}. ${plural(l.days, "working day")} go back to the employee's allowance. Please do not take these days off.\n${appUrl()}/leave/${id}`);
  return { ok: true };
}

export async function cancelLeave(actor: User, id: number): Promise<Result> {
  const l = await loadLeave(id);
  if (!l) return { ok: false, error: "Request not found." };
  const manager = isManager(actor);
  if (!manager && l.person_id !== actor.person_id) return { ok: false, error: "You can only cancel your own leave." };
  if (l.status !== "requested" && l.status !== "approved") return { ok: false, error: `This leave is already ${l.status}.` };
  if (!manager && l.status === "approved" && l.to_date < todayStr()) return { ok: false, error: "Past leave cannot be cancelled. Ask a manager." };
  await run("UPDATE leave SET status='cancelled', decision_note=?, decided_by=?, decided_by_name=?, decided_at=? WHERE id=?", `Cancelled by ${actor.name}`, actor.id, actor.name, nowStr(), id);
  await audit(actor, "leave_cancel", "leave", id, `Cancelled ${l.status} ${l.type} leave for ${l.name}, ${fmtRange(l.from_date, l.to_date)}`);
  await threadMail(l, `${actor.name} ${l.status === "approved" ? "cancelled the approved leave" : "withdrew the request"}.\n\n${l.name}: ${l.type} leave ${fmtRange(l.from_date, l.to_date)}. The days are back in the allowance.`, { exclude: actor.email });
  return { ok: true };
}

export async function setAllowance(actor: User, personId: number, year: number, days: number, note?: string): Promise<Result> {
  if (!isManager(actor)) return { ok: false, error: "Only a manager or admin can change allowances." };
  if (!Number.isFinite(days) || days < 0 || days > 366 || !Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: "Enter a valid year and number of days." };
  await run("INSERT INTO leave_allowance (person_id,year,days,note) VALUES (?,?,?,?) ON CONFLICT (person_id,year) DO UPDATE SET days=EXCLUDED.days, note=EXCLUDED.note", personId, year, days, note?.trim() || null);
  await audit(actor, "update", "leave_allowance", personId, `Leave allowance ${year} set to ${days} days for person #${personId}`, { reason: note?.trim() || undefined });
  return { ok: true };
}

/** What an approver should know before deciding: work assigned in that period, substitutes, logged hours, colleagues off and the balance. */
export async function leaveContext(l: { id: number; person_id: number; from_date: string; to_date: string }) {
  const assignments = await all<any>(
    `SELECT a.id, a.billing_type, pr.name AS project, cl.name AS client FROM assignments a JOIN projects pr ON pr.id=a.project_id JOIN clients cl ON cl.id=pr.client_id
     WHERE a.person_id=? AND a.start_date<=? AND (a.end_date IS NULL OR a.end_date>=?) ORDER BY pr.name`, l.person_id, l.to_date, l.from_date);
  const substitutes = await all<any>(
    `SELECT s.from_date, s.to_date, p.name AS substitute, a.id AS assignment_id FROM substitutions s JOIN people p ON p.id=s.person_id JOIN assignments a ON a.id=s.assignment_id
     WHERE a.person_id=? AND s.from_date<=? AND s.to_date>=?`, l.person_id, l.to_date, l.from_date);
  const logged = await get<{ n: number; h: number | null }>("SELECT COUNT(*) n, SUM(hours) h FROM timesheet_entries WHERE worker_id=? AND work_date BETWEEN ? AND ?", l.person_id, l.from_date, l.to_date);
  const colleagues = await all<any>(
    `SELECT DISTINCT p.name, lv.from_date, lv.to_date, lv.status FROM leave lv JOIN people p ON p.id=lv.person_id
     WHERE lv.id<>? AND lv.status IN ('requested','approved') AND lv.from_date<=? AND lv.to_date>=?
       AND lv.person_id IN (SELECT a2.person_id FROM assignments a2 WHERE a2.project_id IN (SELECT project_id FROM assignments WHERE person_id=?))
     ORDER BY lv.from_date`, l.id, l.to_date, l.from_date, l.person_id);
  return { assignments, substitutes, logged: { n: logged?.n ?? 0, h: logged?.h ?? 0 }, colleagues, balance: await leaveBalance(l.person_id, Number(l.from_date.slice(0, 4))) };
}
