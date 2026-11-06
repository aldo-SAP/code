"use server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { get, run, tx } from "@/lib/db";
import { hashPassword, verifyPassword, makeSession, sessionHours, signBlob, readBlob, SESSION_COOKIE, can } from "@/lib/auth";
import { adminResetMfa, confirmEnrollment, disableMfa, mfaRequiredFor, mfaStatus, recentFailures, regenerateRecovery, verifyMfa } from "@/lib/mfa";
import { requireUser, requireManager, requireAdmin } from "@/lib/session";
import { generateInvoices, generatePayouts, issueInvoice, voidInvoice } from "@/lib/invoicing";
import { parseCsv } from "@/lib/csv";
import { audit, noteLogin } from "@/lib/audit";
import { safeNext } from "@/lib/nexturl";
import { createLeave, decideLeave, cancelLeave, revokeLeave, setAllowance, type LeaveType } from "@/lib/leave";
import { sendMail, retryMail } from "@/lib/mail";
import { sendReminders } from "@/lib/reminders";
import { addHoliday, addHolidaysBulk, copyHolidayYear, deleteHoliday, setHolidayCountry } from "@/lib/holidays";
import { billedThrough, reopenBilled } from "@/lib/history";
import { currentUser } from "@/lib/session";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => { const v = s(fd, k); return v === "" ? null : Number(v.replace(",", ".")); };
const i = (fd: FormData, k: string) => { const v = s(fd, k); return v === "" ? null : Number.parseInt(v, 10); };
const nz = (v: string) => (v === "" ? null : v);
const cur = (fd: FormData, k = "currency") => (s(fd, k) || "EUR").toUpperCase();
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function back(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  if (!msg) redirect(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind === "ok" ? "msg" : "err"}=${encodeURIComponent(msg)}`);
}
const referer = (fd: FormData, fallback: string) => s(fd, "_back") || fallback;

// ------------------------------------------------------------------ auth
const secureCookie = () => process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1";
const PENDING = "mfa_pending";

async function openSession(u: { id: number; role: string }) {
  (await cookies()).set(SESSION_COOKIE, makeSession(u.id, u.role), { httpOnly: true, sameSite: "lax", path: "/", maxAge: sessionHours(u.role) * 3600, secure: secureCookie() });
}
async function setPending(uid: number, purpose: "verify" | "enroll", next: string | null) {
  (await cookies()).set(PENDING, signBlob({ uid, purpose, next }, 5 * 60_000), { httpOnly: true, sameSite: "lax", path: "/login", maxAge: 300, secure: secureCookie() });
}
async function readPending(purpose: "verify" | "enroll") {
  const b = readBlob<{ uid: number; purpose: string; next: string | null }>((await cookies()).get(PENDING)?.value);
  return b && b.purpose === purpose ? b : null;
}

export async function login(fd: FormData) {
  const email = s(fd, "email").toLowerCase();
  if ((await recentFailures(email)) >= 5) back("/login", "Too many failed attempts. Try again in 15 minutes.", "err");
  const u = await get<{ id: number; password_hash: string; role: string; auth_method: string; name: string; totp_enabled: number }>("SELECT id,password_hash,role,auth_method,name,totp_enabled FROM users WHERE email=? AND active=1", email);
  if (u?.auth_method === "microsoft") back("/login", "This account signs in with Microsoft. Use the Microsoft button.", "err");
  if (!u || !verifyPassword(String(fd.get("password") ?? ""), u.password_hash)) {
    await audit({ id: null, name: email || "unknown" }, "login_failed", "user", null, "Failed sign-in attempt");
    back("/login", "Wrong email or password", "err");
  }
  const next = safeNext(s(fd, "next"));
  // password correct: second step if the account has an authenticator, or must get one
  if (u!.totp_enabled) { await setPending(u!.id, "verify", next); redirect("/login/verify"); }
  if (await mfaRequiredFor(u!.role)) { await setPending(u!.id, "enroll", next); redirect("/login/setup"); }
  await noteLogin({ id: u!.id, name: u!.name }, "password");
  await openSession(u!);
  redirect(next ?? (u!.role === "worker" ? "/timesheets" : "/"));
}

/** Step two of a password sign-in: authenticator code or recovery code. */
export async function verifyMfaAction(fd: FormData) {
  const pending = await readPending("verify");
  if (!pending) back("/login", "Your sign-in timed out. Start again.", "err");
  const u = (await get<{ id: number; email: string; name: string; role: string }>("SELECT id,email,name,role FROM users WHERE id=? AND active=1", pending!.uid))!;
  if ((await recentFailures(u.email)) >= 5) back("/login/verify", "Too many failed attempts. Try again in 15 minutes.", "err");
  const r = await verifyMfa(u.id, String(fd.get("code") ?? ""));
  if (!r.ok) {
    await audit({ id: null, name: u.email }, "login_failed", "user", u.id, "Wrong authenticator or recovery code");
    back("/login/verify", "That code is not right. Codes change every 30 seconds.", "err");
  }
  (await cookies()).delete({ name: PENDING, path: "/login" });
  if (r.method === "recovery") await audit({ id: u.id, name: u.name }, "mfa_recovery_used", "user", u.id, `Signed in with a recovery code (${r.recoveryLeft} left)`);
  await noteLogin({ id: u.id, name: u.name }, r.method === "recovery" ? "password and recovery code" : "password and authenticator");
  await openSession(u);
  redirect(pending!.next ?? (u.role === "worker" ? "/timesheets" : "/"));
}

export interface MfaFormState { error?: string; codes?: string[]; href?: string; finish?: boolean }

/** Confirms a new authenticator. Used both during a required first sign-in and from the Account page. */
export async function confirmMfaAction(_prev: MfaFormState, fd: FormData): Promise<MfaFormState> {
  const pending = await readPending("enroll");
  const me = pending ? null : await currentUser();
  const uid = pending?.uid ?? me?.id;
  if (!uid) return { error: "Your sign-in timed out. Start again." };
  const u = (await get<{ id: number; email: string; name: string; role: string }>("SELECT id,email,name,role FROM users WHERE id=? AND active=1", uid))!;
  if ((await recentFailures(u.email)) >= 5) return { error: "Too many failed attempts. Try again in 15 minutes." };
  const r = await confirmEnrollment({ id: u.id, name: u.name }, String(fd.get("code") ?? ""));
  if (!r.ok) {
    await audit({ id: null, name: u.email }, "login_failed", "user", u.id, "Wrong code while setting up the authenticator");
    return { error: r.error };
  }
  // During a required first sign-in the session is opened by finishMfaLoginAction, after the person has seen their recovery codes.
  // (Changing cookies here would refresh the page and the codes would never be shown.)
  return pending ? { codes: r.codes, finish: true } : { codes: r.codes, href: "/account" };
}

export async function finishMfaLoginAction() {
  const pending = await readPending("enroll");
  if (!pending) redirect("/login");
  const u = (await get<{ id: number; name: string; role: string }>("SELECT id,name,role FROM users WHERE id=? AND active=1", pending!.uid))!;
  if (!(await mfaStatus(u.id)).enabled) back("/login/setup", "Finish setting up the authenticator first.", "err");
  (await cookies()).delete({ name: PENDING, path: "/login" });
  await noteLogin({ id: u.id, name: u.name }, "password and authenticator (first setup)");
  await openSession(u);
  redirect(pending!.next ?? (u.role === "worker" ? "/timesheets" : "/"));
}

export async function regenRecoveryAction(_prev: MfaFormState, fd: FormData): Promise<MfaFormState> {
  const me = await requireUser();
  if ((await recentFailures(me.email)) >= 5) return { error: "Too many failed attempts. Try again in 15 minutes." };
  const r = await regenerateRecovery({ id: me.id, name: me.name }, String(fd.get("code") ?? ""));
  if (!r.ok) { await audit({ id: null, name: me.email }, "login_failed", "user", me.id, "Wrong code for recovery codes"); return { error: r.error }; }
  return { codes: r.codes };
}
export async function disableMfaAction(fd: FormData) {
  const me = await requireUser();
  if ((await recentFailures(me.email)) >= 5) back("/account", "Too many failed attempts. Try again in 15 minutes.", "err");
  if (await mfaRequiredFor(me.role)) back("/account", "Your company requires an authenticator for your role, so it cannot be turned off.", "err");
  const r = await disableMfa({ id: me.id, name: me.name }, String(fd.get("code") ?? ""));
  if (!r.ok) { await audit({ id: null, name: me.email }, "login_failed", "user", me.id, "Wrong code when turning off the authenticator"); back("/account", r.error, "err"); }
  back("/account", "Authenticator turned off.");
}
export async function adminResetMfaAction(fd: FormData) {
  const u = await requireAdmin();
  await adminResetMfa({ id: u.id, name: u.name }, i(fd, "rid")!);
  back("/settings", "Authenticator reset. They can set up a new one at their next password sign-in.");
}
export async function saveMfaPolicy(fd: FormData) {
  const u = await requireAdmin();
  const v = ["off", "privileged", "all"].includes(s(fd, "mfa_policy")) ? s(fd, "mfa_policy") : "off";
  await run("INSERT INTO settings (key,value) VALUES ('mfa_policy',?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", v);
  await audit(u, "update", "settings", null, `Authenticator policy for password sign-ins set to ${v}`);
  back("/settings", "Saved");
}
export async function logout() {
  const me = await currentUser();
  if (me) await audit(me, "logout", "user", me.id, "Signed out");
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ------------------------------------------------------------------ CRM
export async function addClient(fd: FormData) {
  const u = await requireManager();
  if (!s(fd, "name")) back("/clients", "Name is required", "err");
  const id = await run("INSERT INTO clients (name,country,address,email,currency,notes) VALUES (?,?,?,?,?,?)", s(fd, "name"), nz(s(fd, "country")), nz(s(fd, "address")), nz(s(fd, "email")), cur(fd), nz(s(fd, "notes")));
  await audit(u, "create", "client", id, `Created client ${s(fd, "name")}`);
  back(`/clients/${id}`, "Client created");
}
export async function updateClient(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "rid")!;
  const before = await get("SELECT name,country,address,email,currency,status,notes FROM clients WHERE id=?", id);
  await run("UPDATE clients SET name=?,country=?,address=?,email=?,currency=?,status=?,notes=? WHERE id=?", s(fd, "name"), nz(s(fd, "country")), nz(s(fd, "address")), nz(s(fd, "email")), cur(fd), s(fd, "status") || "active", nz(s(fd, "notes")), id);
  await audit(u, "update", "client", id, `Updated client ${s(fd, "name")}`, { details: { before, after: await get("SELECT name,country,address,email,currency,status,notes FROM clients WHERE id=?", id) } });
  back(`/clients/${id}`, "Saved");
}
export async function addContact(fd: FormData) {
  const u = await requireManager();
  const cid = i(fd, "client_id")!;
  await run("INSERT INTO contacts (client_id,name,email,phone,role) VALUES (?,?,?,?,?)", cid, s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "role")));
  await audit(u, "create", "contact", cid, `Added contact ${s(fd, "name")}`);
  back(`/clients/${cid}`);
}
export async function deleteContact(fd: FormData) {
  const u = await requireManager();
  const c = await get("SELECT * FROM contacts WHERE id=?", i(fd, "rid")!);
  await run("DELETE FROM contacts WHERE id=?", i(fd, "rid")!);
  await audit(u, "delete", "contact", i(fd, "rid"), `Removed contact ${(c as any)?.name ?? ""}`, { details: c });
  back(referer(fd, "/clients"));
}
export async function addContract(fd: FormData) {
  const u = await requireManager();
  const kind = s(fd, "kind") === "freelancer" ? "freelancer" : "client";
  const terms = s(fd, "payment_terms") === "milestone" ? "milestone" : "monthly";
  if (kind === "freelancer") {
    const fid = await run("INSERT INTO contracts (kind,person_id,title,currency,start_date,end_date,payment_terms,net_days,notes) VALUES ('freelancer',?,?,?,?,?,?,?,?)",
      i(fd, "person_id"), s(fd, "title") || "Contract", cur(fd), nz(s(fd, "start_date")), nz(s(fd, "end_date")), terms, i(fd, "net_days") ?? 30, nz(s(fd, "notes")));
    await audit(u, "create", "contract", fid, `Added freelancer contract ${s(fd, "title") || "Contract"}`);
    back(referer(fd, "/"), "Contract added");
  }
  // A client contract always has someone assigned from day one (internal or external): it is created together with its first assignment.
  const clientId = i(fd, "client_id")!, path = referer(fd, `/clients/${clientId}`);
  const person = i(fd, "person_id");
  const p = person ? await get<{ stage: string; name: string }>("SELECT stage,name FROM people WHERE id=?", person) : undefined;
  if (!p) back(path, "A client contract needs a person assigned (internal or external)", "err");
  if (p!.stage !== "ready" && p!.stage !== "placed") back(path, `${p!.name} is still a student/applicant and cannot be assigned`, "err");
  const bt = s(fd, "billing_type");
  if (!["hourly", "daily", "fixed", "monthly"].includes(bt)) back(path, "Pick a billing type", "err");
  const start = s(fd, "start_date");
  if (!isDate(start)) back(path, "Start date is required", "err");
  const bill = n(fd, "bill_amount");
  if (bt !== "fixed" && (bill == null || bill < 0)) back(path, "Enter the bill rate for the assigned person", "err");
  const title = s(fd, "title") || "Contract";
  const existingProject = i(fd, "project_id");
  if (existingProject && (await get<{ client_id: number }>("SELECT client_id FROM projects WHERE id=?", existingProject))?.client_id !== clientId)
    back(path, "That project belongs to another client", "err");
  let newContractId = 0;
  await tx(async () => {
    const cid = await run("INSERT INTO contracts (kind,client_id,title,currency,start_date,end_date,payment_terms,net_days,notes) VALUES ('client',?,?,?,?,?,?,?,?)",
      clientId, title, cur(fd), start, nz(s(fd, "end_date")), terms, i(fd, "net_days") ?? 30, nz(s(fd, "notes")));
    // One contract = one person. The project may be shared by several people (each on their own contract).
    const pid = existingProject ?? await run("INSERT INTO projects (client_id,name,start_date) VALUES (?,?,?)", clientId, s(fd, "project_name") || title, start);
    const aid = await run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,hours_per_day,start_date,end_date,freelancer_contract_id,direct_to_client,role_title) VALUES (?,?,?,?,?,?,?,?,?,?)",
      pid, cid, person!, bt, n(fd, "hours_per_day") ?? 8, start, nz(s(fd, "end_date")), i(fd, "freelancer_contract_id"), fd.get("direct_to_client") ? 1 : 0, nz(s(fd, "role_title")));
    if (bt !== "fixed") {
      await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, "bill", bill!, cur(fd, "bill_currency"), start);
      const cost = n(fd, "cost_amount");
      if (cost != null && can.finance(u)) await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, "cost", cost, cur(fd, "cost_currency"), start);
    }
    await run("UPDATE people SET stage='placed' WHERE id=?", person!);
    newContractId = cid;
    await audit(u, "create", "contract", cid, `Created contract "${title}" for ${p!.name} (${bt}, bill ${bill ?? "milestones"})`, { details: { person: p!.name, billing: bt, bill, start } });
  });
  back(path, "Contract created for " + p!.name);
}
export async function addDeal(fd: FormData) {
  const u = await requireManager();
  const did = await run("INSERT INTO deals (title,client_id,company_name,contact_name,stage,value,currency,expected_close,notes) VALUES (?,?,?,?,?,?,?,?,?)",
    s(fd, "title"), i(fd, "client_id"), nz(s(fd, "company_name")), nz(s(fd, "contact_name")), s(fd, "stage") || "lead", n(fd, "value") ?? 0, cur(fd), nz(s(fd, "expected_close")), nz(s(fd, "notes")));
  await audit(u, "create", "deal", did, `Added deal ${s(fd, "title")}`);
  back("/deals", "Deal added");
}
export async function moveDeal(fd: FormData) {
  const u = await requireManager();
  const was = await get<{ stage: string; title: string }>("SELECT stage,title FROM deals WHERE id=?", i(fd, "rid")!);
  await run("UPDATE deals SET stage=? WHERE id=?", s(fd, "stage"), i(fd, "rid")!);
  if (was && was.stage !== s(fd, "stage")) await audit(u, "update", "deal", i(fd, "rid"), `Deal "${was.title}": ${was.stage} to ${s(fd, "stage")}`);
  back("/deals");
}
export async function deleteDeal(fd: FormData) {
  const u = await requireManager();
  await audit(u, "delete", "deal", i(fd, "rid"), "Deleted deal", { details: await get("SELECT * FROM deals WHERE id=?", i(fd, "rid")!) });
  await run("DELETE FROM deals WHERE id=?", i(fd, "rid")!);
  back("/deals");
}

// ------------------------------------------------------------------ talent
export async function addPerson(fd: FormData) {
  const u = await requireManager();
  if (!s(fd, "name")) back("/people", "Name is required", "err");
  const id = await run("INSERT INTO people (name,email,phone,country,worker_type,stage,skills,notes) VALUES (?,?,?,?,?,?,?,?)",
    s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "country")), s(fd, "worker_type") === "internal" ? "internal" : "external", s(fd, "stage") || "applicant", nz(s(fd, "skills")), nz(s(fd, "notes")));
  await audit(u, "create", "person", id, `Created person ${s(fd, "name")}`);
  back(`/people/${id}`, "Person created");
}
export async function updatePerson(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "rid")!;
  const before = await get("SELECT name,email,phone,country,worker_type,stage,skills,notes FROM people WHERE id=?", id);
  await run("UPDATE people SET name=?,email=?,phone=?,country=?,worker_type=?,stage=?,skills=?,notes=? WHERE id=?",
    s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "country")), s(fd, "worker_type") === "internal" ? "internal" : "external", s(fd, "stage"), nz(s(fd, "skills")), nz(s(fd, "notes")), id);
  if (fd.has("holiday_country")) await setHolidayCountry(u, id, s(fd, "holiday_country") || null);
  await audit(u, "update", "person", id, `Updated person ${s(fd, "name")}`, { details: { before, after: await get("SELECT name,email,phone,country,worker_type,stage,skills,notes FROM people WHERE id=?", id) } });
  back(`/people/${id}`, "Saved");
}
export async function addHolidayAction(fd: FormData) {
  const u = await requireAdmin();
  const r = await addHoliday(u, s(fd, "country"), s(fd, "day"), s(fd, "name"));
  back(referer(fd, "/holidays"), r.ok ? "Public holiday saved." : r.error, r.ok ? "ok" : "err");
}
export async function addHolidaysBulkAction(fd: FormData) {
  const u = await requireAdmin();
  const r = await addHolidaysBulk(u, s(fd, "country"), String(fd.get("lines") ?? ""));
  back(referer(fd, "/holidays"), r.ok ? `Saved ${r.added} public holiday(s).` : r.error, r.ok ? "ok" : "err");
}
export async function deleteHolidayAction(fd: FormData) {
  const u = await requireAdmin();
  await deleteHoliday(u, s(fd, "country"), s(fd, "day"));
  back(referer(fd, "/holidays"), "Removed.");
}
export async function copyHolidayYearAction(fd: FormData) {
  const u = await requireAdmin();
  const year = i(fd, "year") ?? new Date().getFullYear();
  const r = await copyHolidayYear(u, s(fd, "country"), year - 1, year);
  back(referer(fd, "/holidays"), r.ok ? `Copied ${r.copied} date(s) from ${year - 1}. Moving holidays (Easter, religious) must be corrected by hand.` : r.error, r.ok ? "ok" : "err");
}
export async function addCourse(fd: FormData) {
  const u = await requireManager();
  await audit(u, "create", "course", null, `Added course ${s(fd, "name")}`);
  await run("INSERT INTO courses (name,start_date,end_date,description) VALUES (?,?,?,?)", s(fd, "name"), nz(s(fd, "start_date")), nz(s(fd, "end_date")), nz(s(fd, "description")));
  back("/courses", "Course added");
}
export async function enroll(fd: FormData) {
  const u = await requireManager();
  const pid = i(fd, "person_id"), cid = i(fd, "course_id");
  if (!pid || !cid) back(referer(fd, "/courses"), "Pick a person and a course", "err");
  await run("INSERT INTO enrollments (person_id,course_id) VALUES (?,?) ON CONFLICT DO NOTHING", pid!, cid!);
  await run("UPDATE people SET stage='training' WHERE id=? AND stage='applicant'", pid!);
  await audit(u, "create", "enrollment", pid, `Enrolled person #${pid} in course #${cid}`);
  back(referer(fd, "/courses"));
}
export async function updateEnrollment(fd: FormData) {
  const u = await requireManager();
  const status = s(fd, "status");
  const id = i(fd, "rid")!;
  await run("UPDATE enrollments SET status=?, progress=? WHERE id=?", status, status === "completed" ? 100 : Math.min(100, Math.max(0, i(fd, "progress") ?? 0)), id);
  await audit(u, "update", "enrollment", id, `Enrollment #${id} set to ${status}`);
  back(referer(fd, "/courses"));
}
/** Workers request leave for themselves (vacation waits for approval); managers record leave for anyone (approved at once). */
export async function addLeave(fd: FormData) {
  const u = await requireUser();
  const from = s(fd, "from_date");
  const r = await createLeave(u, {
    personId: can.manage(u) ? (i(fd, "person_id") ?? u.person_id ?? 0) : (u.person_id ?? 0),
    type: (s(fd, "type") || "vacation") as LeaveType, from, to: s(fd, "to_date") || from, notes: s(fd, "notes"), notify: !!fd.get("notify"),
  });
  if (!r.ok) back(referer(fd, "/leave"), r.error, "err");
  back(referer(fd, "/leave"), r.status === "requested" ? "Request sent. You and the approvers get an email, and you will be emailed when it is decided." : "Leave recorded in their history (no approval needed).");
}
export async function decideLeaveAction(fd: FormData) {
  const u = await requireManager();
  const r = await decideLeave(u, i(fd, "rid")!, s(fd, "decision") === "approve" ? "approved" : "rejected", s(fd, "note"));
  if (!r.ok) back(referer(fd, "/leave"), r.error, "err");
  back("/leave", s(fd, "decision") === "approve" ? "Approved. The worker was emailed." : "Rejected. The worker was emailed.");
}
export async function revokeLeaveAction(fd: FormData) {
  const u = await requireManager();
  const r = await revokeLeave(u, i(fd, "rid")!, s(fd, "note"));
  if (!r.ok) back(referer(fd, "/leave"), r.error, "err");
  back(referer(fd, "/leave"), "Withdrawn. The days went back to the employee and the thread was updated by email.");
}
export async function setAllowanceAction(fd: FormData) {
  const u = await requireManager();
  const r = await setAllowance(u, i(fd, "person_id")!, i(fd, "year") ?? new Date().getFullYear(), n(fd, "days") ?? NaN, s(fd, "note"));
  if (!r.ok) back(referer(fd, "/people"), r.error, "err");
  back(referer(fd, "/people"), "Allowance saved.");
}
export async function cancelLeaveAction(fd: FormData) {
  const u = await requireUser();
  const r = await cancelLeave(u, i(fd, "rid")!);
  if (!r.ok) back(referer(fd, "/leave"), r.error, "err");
  back(referer(fd, "/leave"), "Leave cancelled.");
}
export async function saveLeaveSettings(fd: FormData) {
  const u = await requireAdmin();
  const list = s(fd, "leave_approver_emails").split(/[,;\s]+/).filter(Boolean);
  if (list.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) back("/settings", "One of the approver emails is not a valid address.", "err");
  await run("INSERT INTO settings (key,value) VALUES ('leave_approver_emails',?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", list.join(", "));
  const days = n(fd, "default_leave_days");
  if (days != null && days > 0 && days <= 366) await run("INSERT INTO settings (key,value) VALUES ('default_leave_days',?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", String(days));
  await audit(u, "update", "settings", null, `Leave approvers set to ${list.join(", ") || "all managers and admins"}`);
  back("/settings", "Saved");
}
export async function sendTestEmail() {
  const u = await requireAdmin();
  await sendMail({ to: [u.email], subject: "Test email from Talent CRM", text: "If you can read this, outgoing email works.", related: "test" });
  const last = await get<{ status: string; error: string | null }>("SELECT status,error FROM email_outbox WHERE related='test' ORDER BY id DESC LIMIT 1");
  back("/settings", last?.status === "sent" ? `Test email sent to ${u.email}.` : `Test email not sent (${last?.status}): ${last?.error ?? "unknown"}`, last?.status === "sent" ? "ok" : "err");
}
export async function retryEmailAction(fd: FormData) {
  const u = await requireAdmin();
  await retryMail(i(fd, "rid")!);
  await audit(u, "retry", "email", i(fd, "rid"), "Retried sending an email");
  back("/settings", "Retried. See the email log for the result.");
}

// ------------------------------------------------------------------ projects
export async function addProject(fd: FormData) {
  const u = await requireManager();
  const id = await run("INSERT INTO projects (client_id,name,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?)",
    i(fd, "client_id")!, s(fd, "name"), s(fd, "status") || "active", nz(s(fd, "start_date")), nz(s(fd, "end_date")), nz(s(fd, "notes")));
  await audit(u, "create", "project", id, `Created project ${s(fd, "name")}`);
  back(`/projects/${id}`, "Project created");
}
export async function setProjectStatus(fd: FormData) {
  const u = await requireManager();
  await audit(u, "update", "project", i(fd, "rid"), `Project status set to ${s(fd, "status")}`);
  await run("UPDATE projects SET status=? WHERE id=?", s(fd, "status"), i(fd, "rid")!);
  back(referer(fd, "/projects"));
}
/** Changing money rules for dates that are already invoiced or paid out needs a reason and an explicit tick. */
async function guardHistory(fd: FormData, assignmentId: number, effectiveFrom: string, path: string) {
  const through = await billedThrough(assignmentId);
  if (!through || effectiveFrom > through) return null;
  if (!fd.get("confirm_history") || s(fd, "reason").length < 5)
    back(path, `Hours up to ${through} are already invoiced or paid out. Existing invoices stay unchanged, but this change would alter them if they are ever regenerated. Tick the confirmation and write a reason to continue.`, "err");
  return s(fd, "reason");
}
export async function addRate(fd: FormData) {
  const u = await requireManager();
  const kind = s(fd, "kind") === "cost" ? "cost" : "bill";
  const aid = i(fd, "assignment_id")!, path = `/assignments/${aid}`;
  if (kind === "cost" && !can.finance(u)) back(path, "Only admins can edit cost rates", "err");
  if (!isDate(s(fd, "effective_from")) || n(fd, "amount") == null) back(path, "Amount and effective date are required", "err");
  const reason = await guardHistory(fd, aid, s(fd, "effective_from"), path);
  const rid = await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, kind, n(fd, "amount")!, cur(fd), s(fd, "effective_from"));
  await audit(u, "create", "rate", rid, `Added ${kind} rate ${n(fd, "amount")} ${cur(fd)} from ${s(fd, "effective_from")} on assignment #${aid}`, { reason: reason ?? undefined, details: { assignment: aid, kind, amount: n(fd, "amount"), currency: cur(fd), effective_from: s(fd, "effective_from") } });
  back(path, "Rate added");
}
export async function deleteRate(fd: FormData) {
  const u = await requireManager();
  const r = await get<any>("SELECT * FROM rates WHERE id=?", i(fd, "rid")!);
  if (!r) back("/projects");
  const path = `/assignments/${r.assignment_id}`;
  if (r.kind === "cost" && !can.finance(u)) back(path, "Only admins can edit cost rates", "err");
  const reason = await guardHistory(fd, r.assignment_id, r.effective_from, path);
  await run("DELETE FROM rates WHERE id=?", r.id);
  await audit(u, "delete", "rate", r.id, `Removed ${r.kind} rate ${r.amount} ${r.currency} (from ${r.effective_from}) on assignment #${r.assignment_id}`, { reason: reason ?? undefined, details: r });
  back(path);
}
/** A substitution whose hours were already invoiced or paid out cannot be edited or removed. */
async function substitutionBilled(subId: number) {
  const sub = await get<any>("SELECT * FROM substitutions WHERE id=?", subId);
  if (!sub) return { sub, billed: false };
  const row = (await get<{ n: number }>(`SELECT COUNT(*) n FROM timesheet_entries WHERE assignment_id=? AND worker_id=? AND work_date BETWEEN ? AND ? AND (invoice_id IS NOT NULL OR payout_id IS NOT NULL)`, sub.assignment_id, sub.person_id, sub.from_date, sub.to_date))!;
  return { sub, billed: row.n > 0 };
}
export async function addSubstitution(fd: FormData) {
  const u = await requireManager();
  const aid = i(fd, "assignment_id")!, path = `/assignments/${aid}`;
  const from = s(fd, "from_date"), to = s(fd, "to_date");
  if (!isDate(from) || !isDate(to) || to < from) back(path, "Check the substitution dates", "err");
  const person = i(fd, "person_id");
  const p = person ? await get<{ stage: string; name: string }>("SELECT stage,name FROM people WHERE id=?", person) : undefined;
  if (!p) back(path, "Pick a substitute", "err");
  if (p!.stage !== "ready" && p!.stage !== "placed") back(path, `${p!.name} is not ready to be placed`, "err");
  const sid = await run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date,cost_amount,cost_currency,reason) VALUES (?,?,?,?,?,?,?)",
    aid, person!, from, to, can.finance(u) ? n(fd, "cost_amount") : null, cur(fd, "cost_currency"), nz(s(fd, "reason")));
  await audit(u, "create", "substitution", sid, `${p!.name} substitutes on assignment #${aid}, ${from} to ${to}`, { details: { reason: s(fd, "reason") } });
  back(path, "Substitution added");
}
export async function updateSubstitutionCost(fd: FormData) {
  const u = await requireAdmin();
  const { sub, billed } = await substitutionBilled(i(fd, "rid")!);
  if (billed) back(referer(fd, "/projects"), "This substitute's hours are already invoiced or paid out. Reopen those hours first (Unlock billed hours).", "err");
  await run("UPDATE substitutions SET cost_amount=?, cost_currency=? WHERE id=?", n(fd, "cost_amount"), cur(fd, "cost_currency"), i(fd, "rid")!);
  await audit(u, "update", "substitution", i(fd, "rid"), `Substitution cost rate changed from ${sub?.cost_amount ?? "none"} to ${n(fd, "cost_amount") ?? "none"}`);
  back(referer(fd, "/projects"));
}
export async function deleteSubstitution(fd: FormData) {
  const u = await requireManager();
  const { sub, billed } = await substitutionBilled(i(fd, "rid")!);
  if (billed) back(referer(fd, "/projects"), "This substitute's hours are already invoiced or paid out, so the substitution cannot be removed.", "err");
  await run("DELETE FROM substitutions WHERE id=?", i(fd, "rid")!);
  await audit(u, "delete", "substitution", i(fd, "rid"), "Removed substitution", { details: sub });
  back(referer(fd, "/projects"));
}
export async function addMilestone(fd: FormData) {
  const u = await requireManager();
  const aid = i(fd, "assignment_id")!;
  const mid = await run("INSERT INTO milestones (assignment_id,title,bill_amount,bill_currency,cost_amount,cost_currency,due_date) VALUES (?,?,?,?,?,?,?)",
    aid, s(fd, "title"), n(fd, "bill_amount") ?? 0, cur(fd, "bill_currency"), can.finance(u) ? n(fd, "cost_amount") ?? 0 : 0, cur(fd, "cost_currency"), nz(s(fd, "due_date")));
  await audit(u, "create", "milestone", mid, `Added milestone "${s(fd, "title")}" (${n(fd, "bill_amount") ?? 0} ${cur(fd, "bill_currency")})`);
  back(`/assignments/${aid}`, "Milestone added");
}
export async function setMilestone(fd: FormData) {
  const u = await requireManager();
  const status = s(fd, "status");
  const m = await get<{ invoice_id: number | null; payout_id: number | null; assignment_id: number; title: string; status: string }>("SELECT invoice_id,payout_id,assignment_id,title,status FROM milestones WHERE id=?", i(fd, "rid")!);
  if (!m) back("/projects");
  if (m!.invoice_id || m!.payout_id) back(`/assignments/${m!.assignment_id}`, "This milestone is already invoiced or paid out", "err");
  await run("UPDATE milestones SET status=?, approved_on=? WHERE id=?", status, status === "approved" ? new Date().toISOString().slice(0, 10) : null, i(fd, "rid")!);
  await audit(u, "update", "milestone", i(fd, "rid"), `Milestone "${m!.title}": ${m!.status} to ${status}`);
  back(`/assignments/${m!.assignment_id}`);
}

// ------------------------------------------------------------------ timesheets
export async function saveTimesheet(fd: FormData) {
  const u = await requireUser();
  const month = s(fd, "month");
  const personId = can.manage(u) ? i(fd, "person_id")! : u.person_id!;
  const path = `/timesheets?month=${month}${can.manage(u) ? `&person=${personId}` : ""}`;
  const submit = s(fd, "intent") === "submit";
  let saved = 0, skipped = 0;
  const changes: { assignment: number; date: string; from: number | null; to: number | null }[] = [];
  await tx(async () => {
    for (const [key, raw] of fd.entries()) {
      const m = /^h_(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(key);
      if (!m) continue;
      const aid = Number(m[1]), date = m[2];
      const a = await get<{ person_id: number; start_date: string; end_date: string | null }>("SELECT person_id,start_date,end_date FROM assignments WHERE id=?", aid);
      if (!a) continue;
      const allowed = (a.person_id === personId && date >= a.start_date && (!a.end_date || date <= a.end_date)) ||
        !!await get("SELECT 1 FROM substitutions WHERE assignment_id=? AND person_id=? AND from_date<=? AND to_date>=?", aid, personId, date, date);
      const existing = await get<{ id: number; status: string; hours: number; invoice_id: number | null; payout_id: number | null }>("SELECT id,status,hours,invoice_id,payout_id FROM timesheet_entries WHERE assignment_id=? AND worker_id=? AND work_date=?", aid, personId, date);
      const billed = !!existing && (existing.invoice_id != null || existing.payout_id != null);
      const locked = existing && (existing.status === "approved" || billed || (existing.status === "submitted" && !can.manage(u)));
      if (!allowed || locked) { if (String(raw).trim() !== "" && Number(String(raw).replace(",", ".")) !== existing?.hours) skipped++; continue; }
      const hours = Number(String(raw).replace(",", "."));
      if (String(raw).trim() === "" || hours === 0) {
        if (existing) { await run("DELETE FROM timesheet_entries WHERE id=?", existing.id); changes.push({ assignment: aid, date, from: existing.hours, to: null }); }
        continue;
      }
      if (!(hours > 0 && hours <= 24)) { skipped++; continue; }
      if (existing) {
        await run("UPDATE timesheet_entries SET hours=?, status=? WHERE id=?", hours, submit ? "submitted" : "draft", existing.id);
        if (existing.hours !== hours) changes.push({ assignment: aid, date, from: existing.hours, to: hours });
      } else {
        await run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,?,?)", aid, personId, date, hours, submit ? "submitted" : "draft");
        changes.push({ assignment: aid, date, from: null, to: hours });
      }
      saved++;
    }
    let submitted = 0;
    if (submit) submitted = Number(await db_run_count(personId, month));
    if (changes.length || submit)
      await audit(u, submit ? "timesheet_submit" : "timesheet_save", "timesheet", personId, `${submit ? "Submitted" : "Saved"} timesheet ${month} for person #${personId}: ${changes.length} change(s)${submit ? `, ${submitted} day(s) now submitted` : ""}`, { details: { changes } });
  });
  back(path, `${submit ? "Submitted" : "Saved"} ${saved} day(s)${skipped ? `; ${skipped} cell(s) skipped (locked, billed, outside the assignment, or invalid)` : ""}`);
}
async function db_run_count(personId: number, month: string): Promise<number> {
  await run(`UPDATE timesheet_entries SET status='submitted' WHERE worker_id=? AND status IN ('draft','rejected') AND substr(work_date,1,7)=?`, personId, month);
  return (await get<{ n: number }>(`SELECT COUNT(*) n FROM timesheet_entries WHERE worker_id=? AND status='submitted' AND substr(work_date,1,7)=?`, personId, month))!.n;
}
export async function reviewEntries(fd: FormData) {
  const u = await requireManager();
  const decision = s(fd, "decision") === "approve" ? "approved" : "rejected";
  const ids = s(fd, "ids").split(",").map(Number).filter(Boolean);
  await tx(async () => {
    for (const id of ids) {
      const e = await get<any>("SELECT t.work_date,t.hours,t.worker_id,t.assignment_id FROM timesheet_entries t WHERE id=? AND status='submitted'", id);
      if (!e) continue;
      await run("UPDATE timesheet_entries SET status=? WHERE id=? AND status='submitted'", decision, id);
    }
    const first = await get<any>("SELECT worker_id, assignment_id FROM timesheet_entries WHERE id=?", ids[0] ?? 0);
    await audit(u, decision === "approved" ? "timesheet_approve" : "timesheet_reject", "timesheet", first?.worker_id ?? null, `${decision === "approved" ? "Approved" : "Rejected"} ${ids.length} day(s) of person #${first?.worker_id}`, { details: { entryIds: ids } });
  });
  back("/approvals", `${ids.length} entr${ids.length === 1 ? "y" : "ies"} ${decision}`);
}
export async function reopenEntries(fd: FormData) {
  const u = await requireManager();
  const ids = s(fd, "ids").split(",").map(Number).filter(Boolean);
  let n2 = 0;
  await tx(async () => { for (const id of ids) n2 += Number(await db_changes(id)); if (n2) await audit(u, "timesheet_reopen", "timesheet", null, `Reopened ${n2} approved (not yet billed) day(s)`, { details: { entryIds: ids } }); });
  back(referer(fd, "/approvals"), `${n2} day(s) reopened. Days already invoiced use "Unlock billed hours".`);
}
async function db_changes(id: number): Promise<number> {
  const before = (await get<{ n: number }>("SELECT COUNT(*) n FROM timesheet_entries WHERE id=? AND status='approved' AND invoice_id IS NULL AND payout_id IS NULL", id))!.n;
  if (before) await run("UPDATE timesheet_entries SET status='draft' WHERE id=? AND status='approved' AND invoice_id IS NULL AND payout_id IS NULL", id);
  return before;
}
/** Reopen hours that are part of an invoice or payout. Needs a reason and the typed word REOPEN. */
export async function unlockBilled(fd: FormData) {
  const u = await requireManager();
  const ids = fd.getAll("rid").map((v) => Number(v)).filter(Boolean);
  const path = s(fd, "_back") || "/unlock";
  if (s(fd, "confirm") !== "REOPEN") back(path, "Type REOPEN in capital letters to confirm.", "err");
  const r = await reopenBilled({ id: u.id, name: u.name, admin: can.admin(u) }, ids, s(fd, "reason"));
  if (!r.ok) back(path, r.error, "err");
  back("/approvals", `Reopened ${r.reopened} day(s)${r.voided.length ? `; invoice ${r.voided.join(", ")} was voided` : ""}. Fix the hours, submit and approve them again, then regenerate the invoice.`);
}

// ------------------------------------------------------------------ money
export async function runInvoices(fd: FormData) {
  const u = await requireManager();
  const period = s(fd, "period");
  const { invoiceIds, warnings } = await generateInvoices(period);
  await audit(u, "generate", "invoice", null, `Generated ${invoiceIds.length} draft invoice(s) for ${period}`, { details: { invoiceIds, warnings } });
  back(`/invoices?period=${period}`, `${invoiceIds.length} draft invoice(s) generated.${warnings.length ? " Warnings: " + warnings.join(" ") : ""}`, warnings.length ? "err" : "ok");
}
export async function issueInv(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "rid")!;
  let number = "";
  try { number = await issueInvoice(id); } catch (e) { back(`/invoices/${id}`, (e as Error).message, "err"); }
  await audit(u, "issue", "invoice", id, `Issued invoice ${number}`, { details: await get("SELECT number,period,currency,total,due_date FROM invoices WHERE id=?", id) });
  back(`/invoices/${id}`, "Invoice issued");
}
export async function payInv(fd: FormData) {
  const u = await requireManager();
  await run("UPDATE invoices SET status='paid' WHERE id=? AND status='issued'", i(fd, "rid")!);
  await audit(u, "mark_paid", "invoice", i(fd, "rid"), "Marked invoice as paid");
  back(`/invoices/${i(fd, "rid")}`, "Marked as paid");
}
export async function voidInv(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "rid")!;
  const inv = await get<{ status: string; number: string | null; total: number }>("SELECT status,number,total FROM invoices WHERE id=?", id);
  if (inv?.status === "issued") {
    if (s(fd, "confirm") !== "VOID" || s(fd, "reason").length < 5) back(`/invoices/${id}`, "To void an issued invoice type VOID and write a reason.", "err");
    if (!can.admin(u)) back(`/invoices/${id}`, "Only an admin can void an issued invoice.", "err");
  }
  try { await voidInvoice(id); } catch (e) { back(`/invoices/${id}`, (e as Error).message, "err"); }
  await audit(u, inv?.status === "draft" ? "discard_draft" : "void", "invoice", id, `${inv?.status === "draft" ? "Discarded draft" : "Voided invoice " + inv?.number}`, { reason: s(fd, "reason") || undefined, details: inv });
  const exists = await get("SELECT 1 FROM invoices WHERE id=?", id);
  back(exists ? `/invoices/${id}` : "/invoices", "Invoice voided; hours are available for re-invoicing");
}
export async function runPayouts(fd: FormData) {
  const u = await requireAdmin();
  const period = s(fd, "period");
  const { payoutIds, warnings } = await generatePayouts(period);
  await audit(u, "generate", "payout", null, `Generated ${payoutIds.length} draft payout(s) for ${period}`, { details: { payoutIds, warnings } });
  back(`/payouts?period=${period}`, `${payoutIds.length} draft payout(s) generated.${warnings.length ? " Warnings: " + warnings.join(" ") : ""}`, warnings.length ? "err" : "ok");
}
export async function setPayout(fd: FormData) {
  const u = await requireAdmin();
  const id = i(fd, "rid")!, status = s(fd, "status");
  const was = await get<{ status: string; total: number }>("SELECT status,total FROM payouts WHERE id=?", id);
  if (was?.status === "paid" && (s(fd, "confirm") !== "REOPEN" || s(fd, "reason").length < 5))
    back(referer(fd, "/payouts"), "A paid payout is history. Type REOPEN and write a reason to change it.", "err");
  await run("UPDATE payouts SET status=? WHERE id=?", status, id);
  await audit(u, "status", "payout", id, `Payout #${id}: ${was?.status} to ${status}`, { reason: s(fd, "reason") || undefined, details: was });
  back(referer(fd, "/payouts"));
}

// ------------------------------------------------------------------ admin
export async function addUser(fd: FormData) {
  const u = await requireAdmin();
  const email = s(fd, "email").toLowerCase(), pw = String(fd.get("password") ?? "");
  const method = ["microsoft", "password", "both"].includes(s(fd, "auth_method")) ? s(fd, "auth_method") : "password";
  if (!email) back("/settings", "Email is required", "err");
  if (method !== "microsoft" && pw.length < 8) back("/settings", "A password of at least 8 characters is required for password logins", "err");
  if (await get("SELECT 1 FROM users WHERE email=?", email)) back("/settings", "That email already has a login", "err");
  const role = ["admin", "manager", "worker"].includes(s(fd, "role")) ? s(fd, "role") : "worker";
  const hash = hashPassword(method === "microsoft" ? randomBytes(24).toString("hex") : pw);
  const uid = await run("INSERT INTO users (email,name,password_hash,role,person_id,auth_method) VALUES (?,?,?,?,?,?)", email, s(fd, "name") || email, hash, role, i(fd, "person_id"), method);
  await audit(u, "create", "user", uid, `Created login ${email} (${role}, ${method})`);
  back("/settings", "User created");
}
export async function setUserAuth(fd: FormData) {
  const me = await requireAdmin();
  const id = i(fd, "rid")!, method = s(fd, "auth_method");
  if (!["microsoft", "password", "both"].includes(method)) back("/settings", "Invalid sign-in method", "err");
  if (id === me.id && method === "microsoft") back("/settings", "Keep your own admin account on 'both' or 'password' so you can never be locked out if Microsoft is misconfigured.", "err");
  await run("UPDATE users SET auth_method=? WHERE id=?", method, id);
  await audit(me, "update", "user", id, `Sign-in method for login #${id} set to ${method}`);
  back("/settings", "Saved");
}
export async function setUserActive(fd: FormData) {
  const me = await requireAdmin();
  const id = i(fd, "rid")!;
  if (id === me.id) back("/settings", "You cannot deactivate yourself", "err");
  await run("UPDATE users SET active=? WHERE id=?", i(fd, "active")!, id);
  await audit(me, "update", "user", id, `${i(fd, "active") ? "Activated" : "Deactivated"} login #${id}`);
  back("/settings");
}
export async function addFx(fd: FormData) {
  const u = await requireAdmin();
  const c = cur(fd), rate = n(fd, "rate_to_eur");
  if (c === "EUR" || !rate || rate <= 0 || !isDate(s(fd, "as_of"))) back("/settings", "Currency (not EUR), a positive rate and a date are required", "err");
  await run("INSERT INTO fx_rates (currency,rate_to_eur,as_of) VALUES (?,?,?) ON CONFLICT (currency,as_of) DO UPDATE SET rate_to_eur=EXCLUDED.rate_to_eur", c, rate!, s(fd, "as_of"));
  await audit(u, "update", "fx_rate", null, `Exchange rate ${c} = ${rate} EUR as of ${s(fd, "as_of")}`);
  back("/settings", "Exchange rate saved");
}
export async function saveSettings(fd: FormData) {
  const u = await requireAdmin();
  for (const k of ["company_name", "company_address", "company_vat_or_reg", "company_iban", "company_logo_url", "company_footer"]) await run("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", k, s(fd, k));
  await audit(u, "update", "settings", null, "Company settings changed");
  back("/settings", "Saved");
}

// ------------------------------------------------------------------ import
export async function importCsv(fd: FormData) {
  const u = await requireManager();
  const kind = s(fd, "kind");
  const file = fd.get("file");
  const text = file instanceof File && file.size ? await file.text() : s(fd, "text");
  const rows = parseCsv(text);
  if (!rows.length) back("/import", "No rows found. The first line must be the header.", "err");
  let ok = 0; const bad: string[] = [];
  await tx(async () => {
    for (const [idx, r] of rows.entries()) {
      const name = r.name;
      if (!name) { bad.push(`row ${idx + 2}: missing name`); continue; }
      if (kind === "clients") {
        if (await get("SELECT 1 FROM clients WHERE lower(name)=lower(?)", name)) { bad.push(`row ${idx + 2}: ${name} already exists`); continue; }
        await run("INSERT INTO clients (name,country,address,email,currency,notes) VALUES (?,?,?,?,?,?)", name, nz(r.country ?? ""), nz(r.address ?? ""), nz(r.email ?? ""), (r.currency || "EUR").toUpperCase(), nz(r.notes ?? ""));
      } else {
        const stage = ["applicant", "training", "ready", "placed", "alumni"].includes(r.stage) ? r.stage : "applicant";
        await run("INSERT INTO people (name,email,phone,country,worker_type,stage,skills,notes) VALUES (?,?,?,?,?,?,?,?)", name, nz(r.email ?? ""), nz(r.phone ?? ""), nz(r.country ?? ""), r.type === "internal" || r.worker_type === "internal" ? "internal" : "external", stage, nz(r.skills ?? ""), nz(r.notes ?? ""));
      }
      ok++;
    }
    await audit(u, "import", kind, null, `Imported ${ok} ${kind} from CSV (${bad.length} skipped)`);
  });
  back("/import", `Imported ${ok} row(s).${bad.length ? " Skipped: " + bad.slice(0, 10).join("; ") + (bad.length > 10 ? "..." : "") : ""}`, bad.length ? "err" : "ok");
}

// ------------------------------------------------------------------ month-end
export async function remindAction(fd: FormData) {
  const u = await requireManager();
  const period = s(fd, "period"); const one = i(fd, "rid");
  if (!/^\d{4}-\d{2}$/.test(period)) back("/checklist", "Pick a month first.", "err");
  const r = await sendReminders(period, { personIds: one ? [one] : undefined });
  await audit(u, "remind", "timesheet", one ?? null, `Hours reminder for ${period}: ${r.sent.length} sent`);
  back(`/checklist?month=${period}`, r.sent.length ? `Reminder sent to ${r.sent.join(", ")}.${r.skipped.length ? " Skipped: " + r.skipped.join(", ") + "." : ""}` : `Nobody was emailed.${r.skipped.length ? " Skipped: " + r.skipped.join(", ") + "." : ""}`, r.sent.length ? "ok" : "err");
}
