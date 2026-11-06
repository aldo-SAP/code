import { all, get, run, setting } from "./db.ts";
import { audit } from "./audit.ts";
import { sendMail } from "./mail.ts";
import { weekdaysBetween } from "./billing.ts";
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

export interface LeaveInput { personId: number; type: LeaveType; from: string; to: string; notes?: string }

export async function createLeave(actor: User, i: LeaveInput): Promise<Result<{ id: number; status: "requested" | "approved" }>> {
  const manager = isManager(actor);
  if (!LEAVE_TYPES.includes(i.type)) return { ok: false, error: "Choose a leave type." };
  if (!isDate(i.from) || !isDate(i.to) || i.to < i.from) return { ok: false, error: "Check the dates: the end must not be before the start." };
  if (!manager && i.personId !== actor.person_id) return { ok: false, error: "You can only request leave for yourself." };
  if (i.type === "holiday" && !manager) return { ok: false, error: "Public holidays are recorded by a manager." };
  const person = await get<{ name: string }>("SELECT name FROM people WHERE id=?", i.personId);
  if (!person) return { ok: false, error: "Unknown person." };
  const days = weekdaysBetween(i.from, i.to);
  if (days === 0) return { ok: false, error: "That range has no working days (weekends only)." };
  if (!manager && (i.type === "vacation" || i.type === "other") && i.from < todayStr()) return { ok: false, error: "Vacation cannot start in the past. Ask a manager to record it." };
  const clash = await get<{ from_date: string; to_date: string; status: string }>(
    "SELECT from_date,to_date,status FROM leave WHERE person_id=? AND status IN ('requested','approved') AND from_date<=? AND to_date>=?", i.personId, i.to, i.from);
  if (clash) return { ok: false, error: `This overlaps with ${clash.status} leave from ${clash.from_date} to ${clash.to_date}.` };

  const pending = requiresApproval(i.type, manager);
  const status = pending ? "requested" : "approved";
  const id = await run(
    `INSERT INTO leave (person_id,type,from_date,to_date,notes,status,days,requested_by,requested_at,decided_by,decided_by_name,decided_at,decision_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    i.personId, i.type, i.from, i.to, i.notes?.trim() || null, status, days, actor.id, nowStr(),
    pending ? null : manager ? actor.id : null, pending ? null : manager ? actor.name : "automatic", pending ? null : nowStr(), pending ? null : manager ? null : "Reported by the worker");
  await audit(actor, pending ? "leave_request" : "leave_record", "leave", id, `${person.name}: ${i.type} ${i.from} to ${i.to} (${days} working day${days === 1 ? "" : "s"}) ${pending ? "requested" : "recorded"}`, { details: { notes: i.notes ?? null } });

  const range = `${i.from} to ${i.to} (${days} working day${days === 1 ? "" : "s"})`;
  const link = `${appUrl()}/leave/${id}`;
  const workerAddr = await personEmail(i.personId);
  if (pending) {
    await sendMail(await approverEmails(actor.email), `Leave request: ${person.name}, ${i.from} to ${i.to}`,
      `${person.name} asks for ${i.type} leave.\n\nDates: ${range}\n${i.notes ? `Note: ${i.notes}\n` : ""}\nReview and approve or reject: ${link}`, `leave:${id}`);
    if (workerAddr) await sendMail([workerAddr], `We received your leave request (${i.from} to ${i.to})`,
      `Hi ${person.name},\n\nYour ${i.type} request for ${range} was sent for approval. You will get an email when it is decided.\n\nStatus and history: ${appUrl()}/leave`, `leave:${id}`);
  } else if (manager && i.personId !== actor.person_id) {
    if (workerAddr) await sendMail([workerAddr], `Leave recorded for you: ${i.from} to ${i.to}`,
      `Hi ${person.name},\n\n${actor.name} recorded ${i.type} leave for you: ${range}.\n\nSee it here: ${appUrl()}/leave`, `leave:${id}`);
  } else if (!manager) {
    await sendMail(await approverEmails(), `Sick leave reported: ${person.name}, ${i.from} to ${i.to}`, `${person.name} reported ${i.type} leave for ${range}.\n\nDetails: ${link}`, `leave:${id}`);
    if (workerAddr) await sendMail([workerAddr], `Your ${i.type} leave was recorded (${i.from} to ${i.to})`, `Hi ${person.name},\n\nYour ${i.type} leave for ${range} was recorded. Get well soon.\n\n${appUrl()}/leave`, `leave:${id}`);
  }
  return { ok: true, id, status };
}

export async function decideLeave(actor: User, id: number, decision: "approved" | "rejected", note: string): Promise<Result> {
  if (!isManager(actor)) return { ok: false, error: "Only a manager or admin can decide leave requests." };
  const l = await get<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.id=?", id);
  if (!l) return { ok: false, error: "Request not found." };
  if (l.status !== "requested") return { ok: false, error: `This request is already ${l.status}.` };
  if (l.person_id === actor.person_id) return { ok: false, error: "You cannot decide your own request. Ask another manager." };
  if (decision === "rejected" && note.trim().length < 3) return { ok: false, error: "Please give a short reason for rejecting." };
  await run("UPDATE leave SET status=?, decided_by=?, decided_by_name=?, decided_at=?, decision_note=? WHERE id=? AND status='requested'", decision, actor.id, actor.name, nowStr(), note.trim() || null, id);
  await audit(actor, decision === "approved" ? "leave_approve" : "leave_reject", "leave", id, `${decision === "approved" ? "Approved" : "Rejected"} ${l.type} leave for ${l.name}, ${l.from_date} to ${l.to_date}`, { reason: note.trim() || undefined });
  const addr = await personEmail(l.person_id);
  if (addr) await sendMail([addr], `Your leave was ${decision}: ${l.from_date} to ${l.to_date}`,
    `Hi ${l.name},\n\nYour ${l.type} leave from ${l.from_date} to ${l.to_date} (${l.days} working days) was ${decision} by ${actor.name}.\n${note.trim() ? `\nNote: ${note.trim()}\n` : ""}\nDetails: ${appUrl()}/leave`, `leave:${id}`);
  return { ok: true };
}

export async function cancelLeave(actor: User, id: number): Promise<Result> {
  const l = await get<any>("SELECT l.*, p.name FROM leave l JOIN people p ON p.id=l.person_id WHERE l.id=?", id);
  if (!l) return { ok: false, error: "Request not found." };
  const manager = isManager(actor);
  if (!manager && l.person_id !== actor.person_id) return { ok: false, error: "You can only cancel your own leave." };
  if (l.status !== "requested" && l.status !== "approved") return { ok: false, error: `This leave is already ${l.status}.` };
  if (!manager && l.status === "approved" && l.to_date < todayStr()) return { ok: false, error: "Past leave cannot be cancelled. Ask a manager." };
  await run("UPDATE leave SET status='cancelled', decision_note=?, decided_by=?, decided_by_name=?, decided_at=? WHERE id=?", `Cancelled by ${actor.name}`, actor.id, actor.name, nowStr(), id);
  await audit(actor, "leave_cancel", "leave", id, `Cancelled ${l.status} ${l.type} leave for ${l.name}, ${l.from_date} to ${l.to_date}`);
  if (manager && l.person_id !== actor.person_id) {
    const addr = await personEmail(l.person_id);
    if (addr) await sendMail([addr], `Leave cancelled: ${l.from_date} to ${l.to_date}`, `Hi ${l.name},\n\n${actor.name} cancelled your ${l.type} leave from ${l.from_date} to ${l.to_date}.\n\n${appUrl()}/leave`, `leave:${id}`);
  } else {
    await sendMail(await approverEmails(actor.email), `Leave ${l.status === "approved" ? "cancelled" : "request withdrawn"}: ${l.name}, ${l.from_date} to ${l.to_date}`,
      `${l.name} ${l.status === "approved" ? "cancelled approved leave" : "withdrew a leave request"} for ${l.from_date} to ${l.to_date}.`, `leave:${id}`);
  }
  return { ok: true };
}

/** What an approver should know before deciding: work assigned in that period, substitutes, logged hours and colleagues off. */
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
  return { assignments, substitutes, logged: { n: logged?.n ?? 0, h: logged?.h ?? 0 }, colleagues };
}
