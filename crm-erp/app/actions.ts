"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run, tx } from "@/lib/db";
import { hashPassword, verifyPassword, makeSession, SESSION_COOKIE, SESSION_DAYS, can } from "@/lib/auth";
import { requireUser, requireManager, requireAdmin } from "@/lib/session";
import { generateInvoices, generatePayouts, issueInvoice, voidInvoice } from "@/lib/invoicing";
import { parseCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
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
export async function login(fd: FormData) {
  const u = get<{ id: number; password_hash: string; role: string }>("SELECT id,password_hash,role FROM users WHERE email=? AND active=1", s(fd, "email").toLowerCase());
  if (!u || !verifyPassword(String(fd.get("password") ?? ""), u.password_hash)) {
    audit({ id: null, name: s(fd, "email").toLowerCase() || "unknown" }, "login_failed", "user", null, "Failed sign-in attempt");
    back("/login", "Wrong email or password", "err");
  }
  const who = get<{ name: string }>("SELECT name FROM users WHERE id=?", u!.id)!;
  audit({ id: u!.id, name: who.name }, "login", "user", u!.id, "Signed in");
  (await cookies()).set(SESSION_COOKIE, makeSession(u.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1" });
  redirect(u.role === "worker" ? "/timesheets" : "/");
}
export async function logout() {
  const me = await currentUser();
  if (me) audit(me, "logout", "user", me.id, "Signed out");
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ------------------------------------------------------------------ CRM
export async function addClient(fd: FormData) {
  const u = await requireManager();
  if (!s(fd, "name")) back("/clients", "Name is required", "err");
  const id = run("INSERT INTO clients (name,country,address,email,currency,notes) VALUES (?,?,?,?,?,?)", s(fd, "name"), nz(s(fd, "country")), nz(s(fd, "address")), nz(s(fd, "email")), cur(fd), nz(s(fd, "notes")));
  audit(u, "create", "client", id, `Created client ${s(fd, "name")}`);
  back(`/clients/${id}`, "Client created");
}
export async function updateClient(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "id")!;
  const before = get("SELECT name,country,address,email,currency,status,notes FROM clients WHERE id=?", id);
  run("UPDATE clients SET name=?,country=?,address=?,email=?,currency=?,status=?,notes=? WHERE id=?", s(fd, "name"), nz(s(fd, "country")), nz(s(fd, "address")), nz(s(fd, "email")), cur(fd), s(fd, "status") || "active", nz(s(fd, "notes")), id);
  audit(u, "update", "client", id, `Updated client ${s(fd, "name")}`, { details: { before, after: get("SELECT name,country,address,email,currency,status,notes FROM clients WHERE id=?", id) } });
  back(`/clients/${id}`, "Saved");
}
export async function addContact(fd: FormData) {
  const u = await requireManager();
  const cid = i(fd, "client_id")!;
  run("INSERT INTO contacts (client_id,name,email,phone,role) VALUES (?,?,?,?,?)", cid, s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "role")));
  audit(u, "create", "contact", cid, `Added contact ${s(fd, "name")}`);
  back(`/clients/${cid}`);
}
export async function deleteContact(fd: FormData) {
  const u = await requireManager();
  const c = get("SELECT * FROM contacts WHERE id=?", i(fd, "id")!);
  run("DELETE FROM contacts WHERE id=?", i(fd, "id")!);
  audit(u, "delete", "contact", i(fd, "id"), `Removed contact ${(c as any)?.name ?? ""}`, { details: c });
  back(referer(fd, "/clients"));
}
export async function addContract(fd: FormData) {
  const u = await requireManager();
  const kind = s(fd, "kind") === "freelancer" ? "freelancer" : "client";
  const terms = s(fd, "payment_terms") === "milestone" ? "milestone" : "monthly";
  if (kind === "freelancer") {
    const fid = run("INSERT INTO contracts (kind,person_id,title,currency,start_date,end_date,payment_terms,net_days,notes) VALUES ('freelancer',?,?,?,?,?,?,?,?)",
      i(fd, "person_id"), s(fd, "title") || "Contract", cur(fd), nz(s(fd, "start_date")), nz(s(fd, "end_date")), terms, i(fd, "net_days") ?? 30, nz(s(fd, "notes")));
    audit(u, "create", "contract", fid, `Added freelancer contract ${s(fd, "title") || "Contract"}`);
    back(referer(fd, "/"), "Contract added");
  }
  // A client contract always has someone assigned from day one (internal or external): it is created together with its first assignment.
  const clientId = i(fd, "client_id")!, path = referer(fd, `/clients/${clientId}`);
  const person = i(fd, "person_id");
  const p = person ? get<{ stage: string; name: string }>("SELECT stage,name FROM people WHERE id=?", person) : undefined;
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
  if (existingProject && get<{ client_id: number }>("SELECT client_id FROM projects WHERE id=?", existingProject)?.client_id !== clientId)
    back(path, "That project belongs to another client", "err");
  let newContractId = 0;
  tx(() => {
    const cid = run("INSERT INTO contracts (kind,client_id,title,currency,start_date,end_date,payment_terms,net_days,notes) VALUES ('client',?,?,?,?,?,?,?,?)",
      clientId, title, cur(fd), start, nz(s(fd, "end_date")), terms, i(fd, "net_days") ?? 30, nz(s(fd, "notes")));
    // One contract = one person. The project may be shared by several people (each on their own contract).
    const pid = existingProject ?? run("INSERT INTO projects (client_id,name,start_date) VALUES (?,?,?)", clientId, s(fd, "project_name") || title, start);
    const aid = run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,hours_per_day,start_date,end_date,freelancer_contract_id,direct_to_client,role_title) VALUES (?,?,?,?,?,?,?,?,?,?)",
      pid, cid, person!, bt, n(fd, "hours_per_day") ?? 8, start, nz(s(fd, "end_date")), i(fd, "freelancer_contract_id"), fd.get("direct_to_client") ? 1 : 0, nz(s(fd, "role_title")));
    if (bt !== "fixed") {
      run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, "bill", bill!, cur(fd, "bill_currency"), start);
      const cost = n(fd, "cost_amount");
      if (cost != null && can.finance(u)) run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, "cost", cost, cur(fd, "cost_currency"), start);
    }
    run("UPDATE people SET stage='placed' WHERE id=?", person!);
    newContractId = cid;
    audit(u, "create", "contract", cid, `Created contract "${title}" for ${p!.name} (${bt}, bill ${bill ?? "milestones"})`, { details: { person: p!.name, billing: bt, bill, start } });
  });
  back(path, "Contract created for " + p!.name);
}
export async function addDeal(fd: FormData) {
  const u = await requireManager();
  const did = run("INSERT INTO deals (title,client_id,company_name,contact_name,stage,value,currency,expected_close,notes) VALUES (?,?,?,?,?,?,?,?,?)",
    s(fd, "title"), i(fd, "client_id"), nz(s(fd, "company_name")), nz(s(fd, "contact_name")), s(fd, "stage") || "lead", n(fd, "value") ?? 0, cur(fd), nz(s(fd, "expected_close")), nz(s(fd, "notes")));
  audit(u, "create", "deal", did, `Added deal ${s(fd, "title")}`);
  back("/deals", "Deal added");
}
export async function moveDeal(fd: FormData) {
  const u = await requireManager();
  const was = get<{ stage: string; title: string }>("SELECT stage,title FROM deals WHERE id=?", i(fd, "id")!);
  run("UPDATE deals SET stage=? WHERE id=?", s(fd, "stage"), i(fd, "id")!);
  if (was && was.stage !== s(fd, "stage")) audit(u, "update", "deal", i(fd, "id"), `Deal "${was.title}": ${was.stage} to ${s(fd, "stage")}`);
  back("/deals");
}
export async function deleteDeal(fd: FormData) {
  const u = await requireManager();
  audit(u, "delete", "deal", i(fd, "id"), "Deleted deal", { details: get("SELECT * FROM deals WHERE id=?", i(fd, "id")!) });
  run("DELETE FROM deals WHERE id=?", i(fd, "id")!);
  back("/deals");
}

// ------------------------------------------------------------------ talent
export async function addPerson(fd: FormData) {
  const u = await requireManager();
  if (!s(fd, "name")) back("/people", "Name is required", "err");
  const id = run("INSERT INTO people (name,email,phone,country,worker_type,stage,skills,notes) VALUES (?,?,?,?,?,?,?,?)",
    s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "country")), s(fd, "worker_type") === "internal" ? "internal" : "external", s(fd, "stage") || "applicant", nz(s(fd, "skills")), nz(s(fd, "notes")));
  audit(u, "create", "person", id, `Created person ${s(fd, "name")}`);
  back(`/people/${id}`, "Person created");
}
export async function updatePerson(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "id")!;
  const before = get("SELECT name,email,phone,country,worker_type,stage,skills,notes FROM people WHERE id=?", id);
  run("UPDATE people SET name=?,email=?,phone=?,country=?,worker_type=?,stage=?,skills=?,notes=? WHERE id=?",
    s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "country")), s(fd, "worker_type") === "internal" ? "internal" : "external", s(fd, "stage"), nz(s(fd, "skills")), nz(s(fd, "notes")), id);
  audit(u, "update", "person", id, `Updated person ${s(fd, "name")}`, { details: { before, after: get("SELECT name,email,phone,country,worker_type,stage,skills,notes FROM people WHERE id=?", id) } });
  back(`/people/${id}`, "Saved");
}
export async function addCourse(fd: FormData) {
  const u = await requireManager();
  audit(u, "create", "course", null, `Added course ${s(fd, "name")}`);
  run("INSERT INTO courses (name,start_date,end_date,description) VALUES (?,?,?,?)", s(fd, "name"), nz(s(fd, "start_date")), nz(s(fd, "end_date")), nz(s(fd, "description")));
  back("/courses", "Course added");
}
export async function enroll(fd: FormData) {
  const u = await requireManager();
  const pid = i(fd, "person_id"), cid = i(fd, "course_id");
  if (!pid || !cid) back(referer(fd, "/courses"), "Pick a person and a course", "err");
  run("INSERT OR IGNORE INTO enrollments (person_id,course_id) VALUES (?,?)", pid!, cid!);
  run("UPDATE people SET stage='training' WHERE id=? AND stage='applicant'", pid!);
  audit(u, "create", "enrollment", pid, `Enrolled person #${pid} in course #${cid}`);
  back(referer(fd, "/courses"));
}
export async function updateEnrollment(fd: FormData) {
  const u = await requireManager();
  const status = s(fd, "status");
  const id = i(fd, "id")!;
  run("UPDATE enrollments SET status=?, progress=? WHERE id=?", status, status === "completed" ? 100 : Math.min(100, Math.max(0, i(fd, "progress") ?? 0)), id);
  audit(u, "update", "enrollment", id, `Enrollment #${id} set to ${status}`);
  back(referer(fd, "/courses"));
}
export async function addLeave(fd: FormData) {
  const u = await requireUser();
  const pid = can.manage(u) ? i(fd, "person_id")! : u.person_id!;
  const from = s(fd, "from_date"), to = s(fd, "to_date") || from;
  if (!isDate(from) || !isDate(to) || to < from) back(referer(fd, "/timesheets"), "Check the leave dates", "err");
  run("INSERT INTO leave (person_id,type,from_date,to_date,notes) VALUES (?,?,?,?,?)", pid, s(fd, "type") || "vacation", from, to, nz(s(fd, "notes")));
  audit(u, "create", "leave", pid, `Leave ${s(fd, "type") || "vacation"} ${from} to ${to} for person #${pid}`);
  back(referer(fd, "/timesheets"), "Leave saved");
}
export async function deleteLeave(fd: FormData) {
  const u = await requireUser();
  const l = get<{ person_id: number }>("SELECT person_id FROM leave WHERE id=?", i(fd, "id")!);
  if (l && (can.manage(u) || l.person_id === u.person_id)) {
    audit(u, "delete", "leave", l.person_id, "Removed leave", { details: get("SELECT * FROM leave WHERE id=?", i(fd, "id")!) });
    run("DELETE FROM leave WHERE id=?", i(fd, "id")!);
  }
  back(referer(fd, "/timesheets"));
}

// ------------------------------------------------------------------ projects
export async function addProject(fd: FormData) {
  const u = await requireManager();
  const id = run("INSERT INTO projects (client_id,name,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?)",
    i(fd, "client_id")!, s(fd, "name"), s(fd, "status") || "active", nz(s(fd, "start_date")), nz(s(fd, "end_date")), nz(s(fd, "notes")));
  audit(u, "create", "project", id, `Created project ${s(fd, "name")}`);
  back(`/projects/${id}`, "Project created");
}
export async function setProjectStatus(fd: FormData) {
  const u = await requireManager();
  audit(u, "update", "project", i(fd, "id"), `Project status set to ${s(fd, "status")}`);
  run("UPDATE projects SET status=? WHERE id=?", s(fd, "status"), i(fd, "id")!);
  back(referer(fd, "/projects"));
}
/** Changing money rules for dates that are already invoiced or paid out needs a reason and an explicit tick. */
function guardHistory(fd: FormData, assignmentId: number, effectiveFrom: string, path: string) {
  const through = billedThrough(assignmentId);
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
  const reason = guardHistory(fd, aid, s(fd, "effective_from"), path);
  const rid = run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, kind, n(fd, "amount")!, cur(fd), s(fd, "effective_from"));
  audit(u, "create", "rate", rid, `Added ${kind} rate ${n(fd, "amount")} ${cur(fd)} from ${s(fd, "effective_from")} on assignment #${aid}`, { reason: reason ?? undefined, details: { assignment: aid, kind, amount: n(fd, "amount"), currency: cur(fd), effective_from: s(fd, "effective_from") } });
  back(path, "Rate added");
}
export async function deleteRate(fd: FormData) {
  const u = await requireManager();
  const r = get<any>("SELECT * FROM rates WHERE id=?", i(fd, "id")!);
  if (!r) back("/projects");
  const path = `/assignments/${r.assignment_id}`;
  if (r.kind === "cost" && !can.finance(u)) back(path, "Only admins can edit cost rates", "err");
  const reason = guardHistory(fd, r.assignment_id, r.effective_from, path);
  run("DELETE FROM rates WHERE id=?", r.id);
  audit(u, "delete", "rate", r.id, `Removed ${r.kind} rate ${r.amount} ${r.currency} (from ${r.effective_from}) on assignment #${r.assignment_id}`, { reason: reason ?? undefined, details: r });
  back(path);
}
/** A substitution whose hours were already invoiced or paid out cannot be edited or removed. */
function substitutionBilled(subId: number) {
  const sub = get<any>("SELECT * FROM substitutions WHERE id=?", subId);
  if (!sub) return { sub, billed: false };
  const row = get<{ n: number }>(`SELECT COUNT(*) n FROM timesheet_entries WHERE assignment_id=? AND worker_id=? AND work_date BETWEEN ? AND ? AND (invoice_id IS NOT NULL OR payout_id IS NOT NULL)`, sub.assignment_id, sub.person_id, sub.from_date, sub.to_date)!;
  return { sub, billed: row.n > 0 };
}
export async function addSubstitution(fd: FormData) {
  const u = await requireManager();
  const aid = i(fd, "assignment_id")!, path = `/assignments/${aid}`;
  const from = s(fd, "from_date"), to = s(fd, "to_date");
  if (!isDate(from) || !isDate(to) || to < from) back(path, "Check the substitution dates", "err");
  const person = i(fd, "person_id");
  const p = person ? get<{ stage: string; name: string }>("SELECT stage,name FROM people WHERE id=?", person) : undefined;
  if (!p) back(path, "Pick a substitute", "err");
  if (p!.stage !== "ready" && p!.stage !== "placed") back(path, `${p!.name} is not ready to be placed`, "err");
  const sid = run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date,cost_amount,cost_currency,reason) VALUES (?,?,?,?,?,?,?)",
    aid, person!, from, to, can.finance(u) ? n(fd, "cost_amount") : null, cur(fd, "cost_currency"), nz(s(fd, "reason")));
  audit(u, "create", "substitution", sid, `${p!.name} substitutes on assignment #${aid}, ${from} to ${to}`, { details: { reason: s(fd, "reason") } });
  back(path, "Substitution added");
}
export async function updateSubstitutionCost(fd: FormData) {
  const u = await requireAdmin();
  const { sub, billed } = substitutionBilled(i(fd, "id")!);
  if (billed) back(referer(fd, "/projects"), "This substitute's hours are already invoiced or paid out. Reopen those hours first (Unlock billed hours).", "err");
  run("UPDATE substitutions SET cost_amount=?, cost_currency=? WHERE id=?", n(fd, "cost_amount"), cur(fd, "cost_currency"), i(fd, "id")!);
  audit(u, "update", "substitution", i(fd, "id"), `Substitution cost rate changed from ${sub?.cost_amount ?? "none"} to ${n(fd, "cost_amount") ?? "none"}`);
  back(referer(fd, "/projects"));
}
export async function deleteSubstitution(fd: FormData) {
  const u = await requireManager();
  const { sub, billed } = substitutionBilled(i(fd, "id")!);
  if (billed) back(referer(fd, "/projects"), "This substitute's hours are already invoiced or paid out, so the substitution cannot be removed.", "err");
  run("DELETE FROM substitutions WHERE id=?", i(fd, "id")!);
  audit(u, "delete", "substitution", i(fd, "id"), "Removed substitution", { details: sub });
  back(referer(fd, "/projects"));
}
export async function addMilestone(fd: FormData) {
  const u = await requireManager();
  const aid = i(fd, "assignment_id")!;
  const mid = run("INSERT INTO milestones (assignment_id,title,bill_amount,bill_currency,cost_amount,cost_currency,due_date) VALUES (?,?,?,?,?,?,?)",
    aid, s(fd, "title"), n(fd, "bill_amount") ?? 0, cur(fd, "bill_currency"), can.finance(u) ? n(fd, "cost_amount") ?? 0 : 0, cur(fd, "cost_currency"), nz(s(fd, "due_date")));
  audit(u, "create", "milestone", mid, `Added milestone "${s(fd, "title")}" (${n(fd, "bill_amount") ?? 0} ${cur(fd, "bill_currency")})`);
  back(`/assignments/${aid}`, "Milestone added");
}
export async function setMilestone(fd: FormData) {
  const u = await requireManager();
  const status = s(fd, "status");
  const m = get<{ invoice_id: number | null; payout_id: number | null; assignment_id: number; title: string; status: string }>("SELECT invoice_id,payout_id,assignment_id,title,status FROM milestones WHERE id=?", i(fd, "id")!);
  if (!m) back("/projects");
  if (m!.invoice_id || m!.payout_id) back(`/assignments/${m!.assignment_id}`, "This milestone is already invoiced or paid out", "err");
  run("UPDATE milestones SET status=?, approved_on=? WHERE id=?", status, status === "approved" ? new Date().toISOString().slice(0, 10) : null, i(fd, "id")!);
  audit(u, "update", "milestone", i(fd, "id"), `Milestone "${m!.title}": ${m!.status} to ${status}`);
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
  tx(() => {
    for (const [key, raw] of fd.entries()) {
      const m = /^h_(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(key);
      if (!m) continue;
      const aid = Number(m[1]), date = m[2];
      const a = get<{ person_id: number; start_date: string; end_date: string | null }>("SELECT person_id,start_date,end_date FROM assignments WHERE id=?", aid);
      if (!a) continue;
      const allowed = (a.person_id === personId && date >= a.start_date && (!a.end_date || date <= a.end_date)) ||
        !!get("SELECT 1 FROM substitutions WHERE assignment_id=? AND person_id=? AND from_date<=? AND to_date>=?", aid, personId, date, date);
      const existing = get<{ id: number; status: string; hours: number; invoice_id: number | null; payout_id: number | null }>("SELECT id,status,hours,invoice_id,payout_id FROM timesheet_entries WHERE assignment_id=? AND worker_id=? AND work_date=?", aid, personId, date);
      const billed = !!existing && (existing.invoice_id != null || existing.payout_id != null);
      const locked = existing && (existing.status === "approved" || billed || (existing.status === "submitted" && !can.manage(u)));
      if (!allowed || locked) { if (String(raw).trim() !== "" && Number(String(raw).replace(",", ".")) !== existing?.hours) skipped++; continue; }
      const hours = Number(String(raw).replace(",", "."));
      if (String(raw).trim() === "" || hours === 0) {
        if (existing) { run("DELETE FROM timesheet_entries WHERE id=?", existing.id); changes.push({ assignment: aid, date, from: existing.hours, to: null }); }
        continue;
      }
      if (!(hours > 0 && hours <= 24)) { skipped++; continue; }
      if (existing) {
        run("UPDATE timesheet_entries SET hours=?, status=? WHERE id=?", hours, submit ? "submitted" : "draft", existing.id);
        if (existing.hours !== hours) changes.push({ assignment: aid, date, from: existing.hours, to: hours });
      } else {
        run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,?,?)", aid, personId, date, hours, submit ? "submitted" : "draft");
        changes.push({ assignment: aid, date, from: null, to: hours });
      }
      saved++;
    }
    let submitted = 0;
    if (submit) submitted = Number(db_run_count(personId, month));
    if (changes.length || submit)
      audit(u, submit ? "timesheet_submit" : "timesheet_save", "timesheet", personId, `${submit ? "Submitted" : "Saved"} timesheet ${month} for person #${personId}: ${changes.length} change(s)${submit ? `, ${submitted} day(s) now submitted` : ""}`, { details: { changes } });
  });
  back(path, `${submit ? "Submitted" : "Saved"} ${saved} day(s)${skipped ? `; ${skipped} cell(s) skipped (locked, billed, outside the assignment, or invalid)` : ""}`);
}
function db_run_count(personId: number, month: string): number {
  run(`UPDATE timesheet_entries SET status='submitted' WHERE worker_id=? AND status IN ('draft','rejected') AND substr(work_date,1,7)=?`, personId, month);
  return get<{ n: number }>(`SELECT COUNT(*) n FROM timesheet_entries WHERE worker_id=? AND status='submitted' AND substr(work_date,1,7)=?`, personId, month)!.n;
}
export async function reviewEntries(fd: FormData) {
  const u = await requireManager();
  const decision = s(fd, "decision") === "approve" ? "approved" : "rejected";
  const ids = s(fd, "ids").split(",").map(Number).filter(Boolean);
  tx(() => {
    for (const id of ids) {
      const e = get<any>("SELECT t.work_date,t.hours,t.worker_id,t.assignment_id FROM timesheet_entries t WHERE id=? AND status='submitted'", id);
      if (!e) continue;
      run("UPDATE timesheet_entries SET status=? WHERE id=? AND status='submitted'", decision, id);
    }
    const first = get<any>("SELECT worker_id, assignment_id FROM timesheet_entries WHERE id=?", ids[0] ?? 0);
    audit(u, decision === "approved" ? "timesheet_approve" : "timesheet_reject", "timesheet", first?.worker_id ?? null, `${decision === "approved" ? "Approved" : "Rejected"} ${ids.length} day(s) of person #${first?.worker_id}`, { details: { entryIds: ids } });
  });
  back("/approvals", `${ids.length} entr${ids.length === 1 ? "y" : "ies"} ${decision}`);
}
export async function reopenEntries(fd: FormData) {
  const u = await requireManager();
  const ids = s(fd, "ids").split(",").map(Number).filter(Boolean);
  let n2 = 0;
  tx(() => { for (const id of ids) n2 += Number(db_changes(id)); if (n2) audit(u, "timesheet_reopen", "timesheet", null, `Reopened ${n2} approved (not yet billed) day(s)`, { details: { entryIds: ids } }); });
  back(referer(fd, "/approvals"), `${n2} day(s) reopened. Days already invoiced use "Unlock billed hours".`);
}
function db_changes(id: number): number {
  const before = get<{ n: number }>("SELECT COUNT(*) n FROM timesheet_entries WHERE id=? AND status='approved' AND invoice_id IS NULL AND payout_id IS NULL", id)!.n;
  if (before) run("UPDATE timesheet_entries SET status='draft' WHERE id=? AND status='approved' AND invoice_id IS NULL AND payout_id IS NULL", id);
  return before;
}
/** Reopen hours that are part of an invoice or payout. Needs a reason and the typed word REOPEN. */
export async function unlockBilled(fd: FormData) {
  const u = await requireManager();
  const ids = fd.getAll("id").map((v) => Number(v)).filter(Boolean);
  const path = s(fd, "_back") || "/unlock";
  if (s(fd, "confirm") !== "REOPEN") back(path, "Type REOPEN in capital letters to confirm.", "err");
  const r = reopenBilled({ id: u.id, name: u.name, admin: can.admin(u) }, ids, s(fd, "reason"));
  if (!r.ok) back(path, r.error, "err");
  back("/approvals", `Reopened ${r.reopened} day(s)${r.voided.length ? `; invoice ${r.voided.join(", ")} was voided` : ""}. Fix the hours, submit and approve them again, then regenerate the invoice.`);
}

// ------------------------------------------------------------------ money
export async function runInvoices(fd: FormData) {
  const u = await requireManager();
  const period = s(fd, "period");
  const { invoiceIds, warnings } = generateInvoices(period);
  audit(u, "generate", "invoice", null, `Generated ${invoiceIds.length} draft invoice(s) for ${period}`, { details: { invoiceIds, warnings } });
  back(`/invoices?period=${period}`, `${invoiceIds.length} draft invoice(s) generated.${warnings.length ? " Warnings: " + warnings.join(" ") : ""}`, warnings.length ? "err" : "ok");
}
export async function issueInv(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "id")!;
  let number = "";
  try { number = issueInvoice(id); } catch (e) { back(`/invoices/${id}`, (e as Error).message, "err"); }
  audit(u, "issue", "invoice", id, `Issued invoice ${number}`, { details: get("SELECT number,period,currency,total,due_date FROM invoices WHERE id=?", id) });
  back(`/invoices/${id}`, "Invoice issued");
}
export async function payInv(fd: FormData) {
  const u = await requireManager();
  run("UPDATE invoices SET status='paid' WHERE id=? AND status='issued'", i(fd, "id")!);
  audit(u, "mark_paid", "invoice", i(fd, "id"), "Marked invoice as paid");
  back(`/invoices/${i(fd, "id")}`, "Marked as paid");
}
export async function voidInv(fd: FormData) {
  const u = await requireManager();
  const id = i(fd, "id")!;
  const inv = get<{ status: string; number: string | null; total: number }>("SELECT status,number,total FROM invoices WHERE id=?", id);
  if (inv?.status === "issued") {
    if (s(fd, "confirm") !== "VOID" || s(fd, "reason").length < 5) back(`/invoices/${id}`, "To void an issued invoice type VOID and write a reason.", "err");
    if (!can.admin(u)) back(`/invoices/${id}`, "Only an admin can void an issued invoice.", "err");
  }
  try { voidInvoice(id); } catch (e) { back(`/invoices/${id}`, (e as Error).message, "err"); }
  audit(u, inv?.status === "draft" ? "discard_draft" : "void", "invoice", id, `${inv?.status === "draft" ? "Discarded draft" : "Voided invoice " + inv?.number}`, { reason: s(fd, "reason") || undefined, details: inv });
  const exists = get("SELECT 1 FROM invoices WHERE id=?", id);
  back(exists ? `/invoices/${id}` : "/invoices", "Invoice voided; hours are available for re-invoicing");
}
export async function runPayouts(fd: FormData) {
  const u = await requireAdmin();
  const period = s(fd, "period");
  const { payoutIds, warnings } = generatePayouts(period);
  audit(u, "generate", "payout", null, `Generated ${payoutIds.length} draft payout(s) for ${period}`, { details: { payoutIds, warnings } });
  back(`/payouts?period=${period}`, `${payoutIds.length} draft payout(s) generated.${warnings.length ? " Warnings: " + warnings.join(" ") : ""}`, warnings.length ? "err" : "ok");
}
export async function setPayout(fd: FormData) {
  const u = await requireAdmin();
  const id = i(fd, "id")!, status = s(fd, "status");
  const was = get<{ status: string; total: number }>("SELECT status,total FROM payouts WHERE id=?", id);
  if (was?.status === "paid" && (s(fd, "confirm") !== "REOPEN" || s(fd, "reason").length < 5))
    back(referer(fd, "/payouts"), "A paid payout is history. Type REOPEN and write a reason to change it.", "err");
  run("UPDATE payouts SET status=? WHERE id=?", status, id);
  audit(u, "status", "payout", id, `Payout #${id}: ${was?.status} to ${status}`, { reason: s(fd, "reason") || undefined, details: was });
  back(referer(fd, "/payouts"));
}

// ------------------------------------------------------------------ admin
export async function addUser(fd: FormData) {
  const u = await requireAdmin();
  const email = s(fd, "email").toLowerCase(), pw = String(fd.get("password") ?? "");
  if (!email || pw.length < 8) back("/settings", "Email and a password of at least 8 characters are required", "err");
  if (get("SELECT 1 FROM users WHERE email=?", email)) back("/settings", "That email already has a login", "err");
  const role = ["admin", "manager", "worker"].includes(s(fd, "role")) ? s(fd, "role") : "worker";
  const uid = run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES (?,?,?,?,?)", email, s(fd, "name") || email, hashPassword(pw), role, i(fd, "person_id"));
  audit(u, "create", "user", uid, `Created login ${email} (${role})`);
  back("/settings", "User created");
}
export async function setUserActive(fd: FormData) {
  const me = await requireAdmin();
  const id = i(fd, "id")!;
  if (id === me.id) back("/settings", "You cannot deactivate yourself", "err");
  run("UPDATE users SET active=? WHERE id=?", i(fd, "active")!, id);
  audit(me, "update", "user", id, `${i(fd, "active") ? "Activated" : "Deactivated"} login #${id}`);
  back("/settings");
}
export async function addFx(fd: FormData) {
  const u = await requireAdmin();
  const c = cur(fd), rate = n(fd, "rate_to_eur");
  if (c === "EUR" || !rate || rate <= 0 || !isDate(s(fd, "as_of"))) back("/settings", "Currency (not EUR), a positive rate and a date are required", "err");
  run("INSERT OR REPLACE INTO fx_rates (currency,rate_to_eur,as_of) VALUES (?,?,?)", c, rate!, s(fd, "as_of"));
  audit(u, "update", "fx_rate", null, `Exchange rate ${c} = ${rate} EUR as of ${s(fd, "as_of")}`);
  back("/settings", "Exchange rate saved");
}
export async function saveSettings(fd: FormData) {
  const u = await requireAdmin();
  for (const k of ["company_name", "company_address", "company_vat_or_reg", "company_iban"]) run("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", k, s(fd, k));
  audit(u, "update", "settings", null, "Company settings changed");
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
  tx(() => {
    rows.forEach((r, idx) => {
      const name = r.name;
      if (!name) { bad.push(`row ${idx + 2}: missing name`); return; }
      if (kind === "clients") {
        if (get("SELECT 1 FROM clients WHERE lower(name)=lower(?)", name)) { bad.push(`row ${idx + 2}: ${name} already exists`); return; }
        run("INSERT INTO clients (name,country,address,email,currency,notes) VALUES (?,?,?,?,?,?)", name, nz(r.country ?? ""), nz(r.address ?? ""), nz(r.email ?? ""), (r.currency || "EUR").toUpperCase(), nz(r.notes ?? ""));
      } else {
        const stage = ["applicant", "training", "ready", "placed", "alumni"].includes(r.stage) ? r.stage : "applicant";
        run("INSERT INTO people (name,email,phone,country,worker_type,stage,skills,notes) VALUES (?,?,?,?,?,?,?,?)", name, nz(r.email ?? ""), nz(r.phone ?? ""), nz(r.country ?? ""), r.type === "internal" || r.worker_type === "internal" ? "internal" : "external", stage, nz(r.skills ?? ""), nz(r.notes ?? ""));
      }
      ok++;
    });
    audit(u, "import", kind, null, `Imported ${ok} ${kind} from CSV (${bad.length} skipped)`);
  });
  back("/import", `Imported ${ok} row(s).${bad.length ? " Skipped: " + bad.slice(0, 10).join("; ") + (bad.length > 10 ? "..." : "") : ""}`, bad.length ? "err" : "ok");
}
