"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run, tx } from "@/lib/db";
import { hashPassword, verifyPassword, makeSession, SESSION_COOKIE, SESSION_DAYS, can } from "@/lib/auth";
import { requireUser, requireManager, requireAdmin } from "@/lib/session";
import { generateInvoices, generatePayouts, issueInvoice, voidInvoice } from "@/lib/invoicing";
import { parseCsv } from "@/lib/csv";

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
  if (!u || !verifyPassword(String(fd.get("password") ?? ""), u.password_hash)) back("/login", "Wrong email or password", "err");
  (await cookies()).set(SESSION_COOKIE, makeSession(u.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1" });
  redirect(u.role === "worker" ? "/timesheets" : "/");
}
export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ------------------------------------------------------------------ CRM
export async function addClient(fd: FormData) {
  await requireManager();
  if (!s(fd, "name")) back("/clients", "Name is required", "err");
  const id = run("INSERT INTO clients (name,country,address,email,currency,notes) VALUES (?,?,?,?,?,?)", s(fd, "name"), nz(s(fd, "country")), nz(s(fd, "address")), nz(s(fd, "email")), cur(fd), nz(s(fd, "notes")));
  back(`/clients/${id}`, "Client created");
}
export async function updateClient(fd: FormData) {
  await requireManager();
  const id = i(fd, "id")!;
  run("UPDATE clients SET name=?,country=?,address=?,email=?,currency=?,status=?,notes=? WHERE id=?", s(fd, "name"), nz(s(fd, "country")), nz(s(fd, "address")), nz(s(fd, "email")), cur(fd), s(fd, "status") || "active", nz(s(fd, "notes")), id);
  back(`/clients/${id}`, "Saved");
}
export async function addContact(fd: FormData) {
  await requireManager();
  const cid = i(fd, "client_id")!;
  run("INSERT INTO contacts (client_id,name,email,phone,role) VALUES (?,?,?,?,?)", cid, s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "role")));
  back(`/clients/${cid}`);
}
export async function deleteContact(fd: FormData) {
  await requireManager();
  run("DELETE FROM contacts WHERE id=?", i(fd, "id")!);
  back(referer(fd, "/clients"));
}
export async function addContract(fd: FormData) {
  const u = await requireManager();
  const kind = s(fd, "kind") === "freelancer" ? "freelancer" : "client";
  const terms = s(fd, "payment_terms") === "milestone" ? "milestone" : "monthly";
  if (kind === "freelancer") {
    run("INSERT INTO contracts (kind,person_id,title,currency,start_date,end_date,payment_terms,net_days,notes) VALUES ('freelancer',?,?,?,?,?,?,?,?)",
      i(fd, "person_id"), s(fd, "title") || "Contract", cur(fd), nz(s(fd, "start_date")), nz(s(fd, "end_date")), terms, i(fd, "net_days") ?? 30, nz(s(fd, "notes")));
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
  });
  back(path, "Contract created for " + p!.name);
}
export async function addDeal(fd: FormData) {
  await requireManager();
  run("INSERT INTO deals (title,client_id,company_name,contact_name,stage,value,currency,expected_close,notes) VALUES (?,?,?,?,?,?,?,?,?)",
    s(fd, "title"), i(fd, "client_id"), nz(s(fd, "company_name")), nz(s(fd, "contact_name")), s(fd, "stage") || "lead", n(fd, "value") ?? 0, cur(fd), nz(s(fd, "expected_close")), nz(s(fd, "notes")));
  back("/deals", "Deal added");
}
export async function moveDeal(fd: FormData) {
  await requireManager();
  run("UPDATE deals SET stage=? WHERE id=?", s(fd, "stage"), i(fd, "id")!);
  back("/deals");
}
export async function deleteDeal(fd: FormData) {
  await requireManager();
  run("DELETE FROM deals WHERE id=?", i(fd, "id")!);
  back("/deals");
}

// ------------------------------------------------------------------ talent
export async function addPerson(fd: FormData) {
  await requireManager();
  if (!s(fd, "name")) back("/people", "Name is required", "err");
  const id = run("INSERT INTO people (name,email,phone,country,worker_type,stage,skills,notes) VALUES (?,?,?,?,?,?,?,?)",
    s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "country")), s(fd, "worker_type") === "internal" ? "internal" : "external", s(fd, "stage") || "applicant", nz(s(fd, "skills")), nz(s(fd, "notes")));
  back(`/people/${id}`, "Person created");
}
export async function updatePerson(fd: FormData) {
  await requireManager();
  const id = i(fd, "id")!;
  run("UPDATE people SET name=?,email=?,phone=?,country=?,worker_type=?,stage=?,skills=?,notes=? WHERE id=?",
    s(fd, "name"), nz(s(fd, "email")), nz(s(fd, "phone")), nz(s(fd, "country")), s(fd, "worker_type") === "internal" ? "internal" : "external", s(fd, "stage"), nz(s(fd, "skills")), nz(s(fd, "notes")), id);
  back(`/people/${id}`, "Saved");
}
export async function addCourse(fd: FormData) {
  await requireManager();
  run("INSERT INTO courses (name,start_date,end_date,description) VALUES (?,?,?,?)", s(fd, "name"), nz(s(fd, "start_date")), nz(s(fd, "end_date")), nz(s(fd, "description")));
  back("/courses", "Course added");
}
export async function enroll(fd: FormData) {
  await requireManager();
  const pid = i(fd, "person_id"), cid = i(fd, "course_id");
  if (!pid || !cid) back(referer(fd, "/courses"), "Pick a person and a course", "err");
  run("INSERT OR IGNORE INTO enrollments (person_id,course_id) VALUES (?,?)", pid!, cid!);
  run("UPDATE people SET stage='training' WHERE id=? AND stage='applicant'", pid!);
  back(referer(fd, "/courses"));
}
export async function updateEnrollment(fd: FormData) {
  await requireManager();
  const status = s(fd, "status");
  const id = i(fd, "id")!;
  run("UPDATE enrollments SET status=?, progress=? WHERE id=?", status, status === "completed" ? 100 : Math.min(100, Math.max(0, i(fd, "progress") ?? 0)), id);
  back(referer(fd, "/courses"));
}
export async function addLeave(fd: FormData) {
  const u = await requireUser();
  const pid = can.manage(u) ? i(fd, "person_id")! : u.person_id!;
  const from = s(fd, "from_date"), to = s(fd, "to_date") || from;
  if (!isDate(from) || !isDate(to) || to < from) back(referer(fd, "/timesheets"), "Check the leave dates", "err");
  run("INSERT INTO leave (person_id,type,from_date,to_date,notes) VALUES (?,?,?,?,?)", pid, s(fd, "type") || "vacation", from, to, nz(s(fd, "notes")));
  back(referer(fd, "/timesheets"), "Leave saved");
}
export async function deleteLeave(fd: FormData) {
  const u = await requireUser();
  const l = get<{ person_id: number }>("SELECT person_id FROM leave WHERE id=?", i(fd, "id")!);
  if (l && (can.manage(u) || l.person_id === u.person_id)) run("DELETE FROM leave WHERE id=?", i(fd, "id")!);
  back(referer(fd, "/timesheets"));
}

// ------------------------------------------------------------------ projects
export async function addProject(fd: FormData) {
  await requireManager();
  const id = run("INSERT INTO projects (client_id,name,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?)",
    i(fd, "client_id")!, s(fd, "name"), s(fd, "status") || "active", nz(s(fd, "start_date")), nz(s(fd, "end_date")), nz(s(fd, "notes")));
  back(`/projects/${id}`, "Project created");
}
export async function setProjectStatus(fd: FormData) {
  await requireManager();
  run("UPDATE projects SET status=? WHERE id=?", s(fd, "status"), i(fd, "id")!);
  back(referer(fd, "/projects"));
}
export async function addRate(fd: FormData) {
  const u = await requireManager();
  const kind = s(fd, "kind") === "cost" ? "cost" : "bill";
  const aid = i(fd, "assignment_id")!;
  if (kind === "cost" && !can.finance(u)) back(`/assignments/${aid}`, "Only admins can edit cost rates", "err");
  if (!isDate(s(fd, "effective_from")) || n(fd, "amount") == null) back(`/assignments/${aid}`, "Amount and effective date are required", "err");
  run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", aid, kind, n(fd, "amount")!, cur(fd), s(fd, "effective_from"));
  back(`/assignments/${aid}`, "Rate added");
}
export async function deleteRate(fd: FormData) {
  const u = await requireManager();
  const r = get<{ kind: string; assignment_id: number }>("SELECT kind,assignment_id FROM rates WHERE id=?", i(fd, "id")!);
  if (r && (r.kind === "bill" || can.finance(u))) run("DELETE FROM rates WHERE id=?", i(fd, "id")!);
  back(r ? `/assignments/${r.assignment_id}` : "/projects");
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
  run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date,cost_amount,cost_currency,reason) VALUES (?,?,?,?,?,?,?)",
    aid, person!, from, to, can.finance(u) ? n(fd, "cost_amount") : null, cur(fd, "cost_currency"), nz(s(fd, "reason")));
  back(path, "Substitution added");
}
export async function updateSubstitutionCost(fd: FormData) {
  await requireAdmin();
  run("UPDATE substitutions SET cost_amount=?, cost_currency=? WHERE id=?", n(fd, "cost_amount"), cur(fd, "cost_currency"), i(fd, "id")!);
  back(referer(fd, "/projects"));
}
export async function deleteSubstitution(fd: FormData) {
  await requireManager();
  run("DELETE FROM substitutions WHERE id=?", i(fd, "id")!);
  back(referer(fd, "/projects"));
}
export async function addMilestone(fd: FormData) {
  const u = await requireManager();
  const aid = i(fd, "assignment_id")!;
  run("INSERT INTO milestones (assignment_id,title,bill_amount,bill_currency,cost_amount,cost_currency,due_date) VALUES (?,?,?,?,?,?,?)",
    aid, s(fd, "title"), n(fd, "bill_amount") ?? 0, cur(fd, "bill_currency"), can.finance(u) ? n(fd, "cost_amount") ?? 0 : 0, cur(fd, "cost_currency"), nz(s(fd, "due_date")));
  back(`/assignments/${aid}`, "Milestone added");
}
export async function setMilestone(fd: FormData) {
  await requireManager();
  const status = s(fd, "status");
  const m = get<{ invoice_id: number | null; payout_id: number | null; assignment_id: number }>("SELECT invoice_id,payout_id,assignment_id FROM milestones WHERE id=?", i(fd, "id")!);
  if (!m) back("/projects");
  if (m!.invoice_id || m!.payout_id) back(`/assignments/${m!.assignment_id}`, "This milestone is already invoiced or paid out", "err");
  run("UPDATE milestones SET status=?, approved_on=? WHERE id=?", status, status === "approved" ? new Date().toISOString().slice(0, 10) : null, i(fd, "id")!);
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
  tx(() => {
    for (const [key, raw] of fd.entries()) {
      const m = /^h_(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(key);
      if (!m) continue;
      const aid = Number(m[1]), date = m[2];
      const a = get<{ person_id: number; start_date: string; end_date: string | null }>("SELECT person_id,start_date,end_date FROM assignments WHERE id=?", aid);
      if (!a) continue;
      const allowed = (a.person_id === personId && date >= a.start_date && (!a.end_date || date <= a.end_date)) ||
        !!get("SELECT 1 FROM substitutions WHERE assignment_id=? AND person_id=? AND from_date<=? AND to_date>=?", aid, personId, date, date);
      const existing = get<{ id: number; status: string }>("SELECT id,status FROM timesheet_entries WHERE assignment_id=? AND worker_id=? AND work_date=?", aid, personId, date);
      const locked = existing && (existing.status === "approved" || (existing.status === "submitted" && !can.manage(u)));
      if (!allowed || locked) { if (String(raw).trim() !== "" && (locked || !allowed)) skipped++; continue; }
      const hours = Number(String(raw).replace(",", "."));
      if (String(raw).trim() === "" || hours === 0) { if (existing) run("DELETE FROM timesheet_entries WHERE id=?", existing.id); continue; }
      if (!(hours > 0 && hours <= 24)) { skipped++; continue; }
      if (existing) run("UPDATE timesheet_entries SET hours=?, status=? WHERE id=?", hours, submit ? "submitted" : "draft", existing.id);
      else run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,?,?)", aid, personId, date, hours, submit ? "submitted" : "draft");
      saved++;
    }
    if (submit) run(`UPDATE timesheet_entries SET status='submitted' WHERE worker_id=? AND status IN ('draft','rejected') AND substr(work_date,1,7)=?`, personId, month);
  });
  back(path, `${submit ? "Submitted" : "Saved"} ${saved} day(s)${skipped ? `; ${skipped} cell(s) skipped (locked, outside the assignment, or invalid)` : ""}`);
}
export async function reviewEntries(fd: FormData) {
  await requireManager();
  const decision = s(fd, "decision") === "approve" ? "approved" : "rejected";
  const ids = s(fd, "ids").split(",").map(Number).filter(Boolean);
  tx(() => { for (const id of ids) run("UPDATE timesheet_entries SET status=? WHERE id=? AND status='submitted'", decision, id); });
  back("/approvals", `${ids.length} entr${ids.length === 1 ? "y" : "ies"} ${decision}`);
}
export async function reopenEntries(fd: FormData) {
  await requireManager();
  const ids = s(fd, "ids").split(",").map(Number).filter(Boolean);
  tx(() => { for (const id of ids) run("UPDATE timesheet_entries SET status='draft' WHERE id=? AND status='approved' AND invoice_id IS NULL AND payout_id IS NULL", id); });
  back(referer(fd, "/approvals"), "Reopened (invoiced entries cannot be reopened; void the invoice first)");
}

// ------------------------------------------------------------------ money
export async function runInvoices(fd: FormData) {
  await requireManager();
  const period = s(fd, "period");
  const { invoiceIds, warnings } = generateInvoices(period);
  back(`/invoices?period=${period}`, `${invoiceIds.length} draft invoice(s) generated.${warnings.length ? " Warnings: " + warnings.join(" ") : ""}`, warnings.length ? "err" : "ok");
}
export async function issueInv(fd: FormData) {
  await requireManager();
  const id = i(fd, "id")!;
  try { issueInvoice(id); } catch (e) { back(`/invoices/${id}`, (e as Error).message, "err"); }
  back(`/invoices/${id}`, "Invoice issued");
}
export async function payInv(fd: FormData) {
  await requireManager();
  run("UPDATE invoices SET status='paid' WHERE id=? AND status='issued'", i(fd, "id")!);
  back(`/invoices/${i(fd, "id")}`, "Marked as paid");
}
export async function voidInv(fd: FormData) {
  await requireManager();
  const id = i(fd, "id")!;
  try { voidInvoice(id); } catch (e) { back(`/invoices/${id}`, (e as Error).message, "err"); }
  const exists = get("SELECT 1 FROM invoices WHERE id=?", id);
  back(exists ? `/invoices/${id}` : "/invoices", "Invoice voided; hours are available for re-invoicing");
}
export async function runPayouts(fd: FormData) {
  await requireAdmin();
  const period = s(fd, "period");
  const { payoutIds, warnings } = generatePayouts(period);
  back(`/payouts?period=${period}`, `${payoutIds.length} draft payout(s) generated.${warnings.length ? " Warnings: " + warnings.join(" ") : ""}`, warnings.length ? "err" : "ok");
}
export async function setPayout(fd: FormData) {
  await requireAdmin();
  run("UPDATE payouts SET status=? WHERE id=?", s(fd, "status"), i(fd, "id")!);
  back(referer(fd, "/payouts"));
}

// ------------------------------------------------------------------ admin
export async function addUser(fd: FormData) {
  await requireAdmin();
  const email = s(fd, "email").toLowerCase(), pw = String(fd.get("password") ?? "");
  if (!email || pw.length < 8) back("/settings", "Email and a password of at least 8 characters are required", "err");
  if (get("SELECT 1 FROM users WHERE email=?", email)) back("/settings", "That email already has a login", "err");
  const role = ["admin", "manager", "worker"].includes(s(fd, "role")) ? s(fd, "role") : "worker";
  run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES (?,?,?,?,?)", email, s(fd, "name") || email, hashPassword(pw), role, i(fd, "person_id"));
  back("/settings", "User created");
}
export async function setUserActive(fd: FormData) {
  const me = await requireAdmin();
  const id = i(fd, "id")!;
  if (id === me.id) back("/settings", "You cannot deactivate yourself", "err");
  run("UPDATE users SET active=? WHERE id=?", i(fd, "active")!, id);
  back("/settings");
}
export async function addFx(fd: FormData) {
  await requireAdmin();
  const c = cur(fd), rate = n(fd, "rate_to_eur");
  if (c === "EUR" || !rate || rate <= 0 || !isDate(s(fd, "as_of"))) back("/settings", "Currency (not EUR), a positive rate and a date are required", "err");
  run("INSERT OR REPLACE INTO fx_rates (currency,rate_to_eur,as_of) VALUES (?,?,?)", c, rate!, s(fd, "as_of"));
  back("/settings", "Exchange rate saved");
}
export async function saveSettings(fd: FormData) {
  await requireAdmin();
  for (const k of ["company_name", "company_address", "company_vat_or_reg", "company_iban"]) run("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", k, s(fd, k));
  back("/settings", "Saved");
}

// ------------------------------------------------------------------ import
export async function importCsv(fd: FormData) {
  await requireManager();
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
  });
  back("/import", `Imported ${ok} row(s).${bad.length ? " Skipped: " + bad.slice(0, 10).join("; ") + (bad.length > 10 ? "..." : "") : ""}`, bad.length ? "err" : "ok");
}
