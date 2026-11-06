import test from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
const { run, all, get } = await import("../lib/db.ts");
const inv = await import("../lib/invoicing.ts");
const hist = await import("../lib/history.ts");
const { audit } = await import("../lib/audit.ts");

const X = run("INSERT INTO people (name,worker_type,stage) VALUES ('Xena','external','placed')");
const client = run("INSERT INTO clients (name) VALUES ('Acme')");
const project = run("INSERT INTO projects (client_id,name) VALUES (?,'Portal')", client);
const a = run("INSERT INTO assignments (project_id,person_id,billing_type,start_date) VALUES (?,?,'daily','2026-01-01')", project, X);
run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'bill',400,'2026-01-01')", a);
run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'cost',250,'2026-01-01')", a);
const e = (d: string) => run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,8,'approved')", a, X, d);
const e1 = e("2026-10-01"), e2 = e("2026-10-02");
const manager = { id: 2, name: "Maya", admin: false }, admin = { id: 1, name: "Ana", admin: true };

test("audit log is append-only", () => {
  audit(admin, "test", "x", 1, "hello");
  assert.throws(() => run("UPDATE audit_log SET summary='x'"), /append-only/);
  assert.throws(() => run("DELETE FROM audit_log"), /append-only/);
  assert.equal(all("SELECT * FROM audit_log").length, 1);
});

test("a reason is mandatory", () => {
  inv.generateInvoices("2026-10");
  const r = hist.reopenBilled(admin, [e1], "no");
  assert.equal(r.ok, false);
});

test("draft invoice: reopening a day rebuilds the draft without it", () => {
  const r = hist.reopenBilled(manager, [e1], "Wrong hours entered");
  assert.equal(r.ok, true);
  assert.equal(get("SELECT status FROM timesheet_entries WHERE id=?", e1)!.status, "draft");
  assert.equal(get("SELECT total FROM invoices WHERE status='draft'")!.total, 400);
});

test("issued invoice: manager is refused, admin voids it and the log records who and why", () => {
  inv.issueInvoice(get("SELECT id FROM invoices WHERE status='draft'")!.id, "2026-11-02");
  const refused = hist.reopenBilled(manager, [e2], "Client disputed this day");
  assert.equal(refused.ok, false);
  const ok = hist.reopenBilled(admin, [e2], "Client disputed this day");
  assert.equal(ok.ok, true);
  assert.equal(get("SELECT status FROM invoices WHERE number='2026-0001'")!.status, "void");
  const log = get<any>("SELECT * FROM audit_log WHERE action='reopen_billed_hours' ORDER BY id DESC LIMIT 1")!;
  assert.equal(log.user_name, "Ana");
  assert.equal(log.reason, "Client disputed this day");
  assert.match(log.summary, /voided invoice 2026-0001/);
});

test("paid invoices can never be reopened", () => {
  run("UPDATE timesheet_entries SET status='approved'");
  inv.generateInvoices("2026-10");
  const id = get("SELECT id FROM invoices WHERE status='draft'")!.id;
  inv.issueInvoice(id, "2026-11-05");
  run("UPDATE invoices SET status='paid' WHERE id=?", id);
  const r = hist.reopenBilled(admin, [e1], "Please let me");
  assert.equal(r.ok, false);
  assert.match((r as any).error, /PAID/);
  assert.equal(hist.billedThrough(a), "2026-10-02");
});
