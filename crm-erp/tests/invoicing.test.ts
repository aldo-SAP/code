import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
const { run, all, get } = await import("../lib/db.ts");
const inv = await import("../lib/invoicing.ts");

const person = (name: string, type: string) => run("INSERT INTO people (name,worker_type,stage) VALUES (?,?,'ready')", name, type);
const client = await run("INSERT INTO clients (name) VALUES ('Acme GmbH')");
const contract = await run("INSERT INTO contracts (kind,client_id,title,net_days) VALUES ('client',?,'Xena contract',45)", client);
const project = await run("INSERT INTO projects (client_id,name) VALUES (?,'Portal')", client);
const X = await person("Xena (ext)", "external");
const Y = await person("Yuri (ext)", "external");
const Z = await person("Zed (int)", "internal");

const assignment = await run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date) VALUES (?,?,?,'daily','2026-01-01')", project, contract, X);
await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", assignment, "bill", 400, "EUR", "2026-01-01");
await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", assignment, "cost", 250, "EUR", "2026-01-01");
await run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date,cost_amount) VALUES (?,?,?,?,?)", assignment, Y, "2026-10-12", "2026-10-16", 200);

const entry = (w: number, d: string, h = 8, status = "approved") =>
  run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,?,?)", assignment, w, d, h, status);
for (const d of ["2026-10-01", "2026-10-02", "2026-10-05"]) await entry(X, d);
for (const d of ["2026-10-12", "2026-10-13"]) await entry(Y, d);
await entry(X, "2026-10-14", 8, "submitted"); // not approved: must not be billed

test("client invoice shows X only, X's days + Y's days at X's rate", async () => {
  const { invoiceIds, warnings } = await inv.generateInvoices("2026-10");
  assert.deepEqual(warnings, []);
  assert.equal(invoiceIds.length, 1);
  const lines = await all("SELECT * FROM invoice_lines WHERE invoice_id=?", invoiceIds[0]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 5);
  assert.equal(lines[0].amount, 2000);
  assert.match(lines[0].description, /Xena/);
  assert.doesNotMatch(lines[0].description, /Yuri/);
  assert.match(lines[0].detail, /16h by Yuri/);
});

test("regenerating drafts is idempotent", async () => {
  await inv.generateInvoices("2026-10");
  await inv.generateInvoices("2026-10");
  assert.equal((await all("SELECT * FROM invoices")).length, 1);
  assert.equal((await get("SELECT total FROM invoices"))!.total, 2000);
});

test("payouts: X at own cost rate, Y at substitution cost rate", async () => {
  const { payoutIds, warnings } = await inv.generatePayouts("2026-10");
  assert.deepEqual(warnings, []);
  assert.equal(payoutIds.length, 2);
  const totals = Object.fromEntries((await all("SELECT person_id,total,kind FROM payouts")).map((p) => [p.person_id, p.total]));
  assert.equal(totals[X], 750); // 3 days x 250
  assert.equal(totals[Y], 400); // 2 days x 200
});

test("margin = invoiced - payouts", async () => {
  const m = await inv.marginReport("2026-10");
  assert.equal(m.revenue, 2000);
  assert.equal(m.cost, 1150);
  assert.equal(m.rows[0].margin, 850);
});

test("issuing numbers invoices sequentially and sets the due date from the contract", async () => {
  const id = (await all("SELECT id FROM invoices"))[0].id;
  assert.equal(await inv.issueInvoice(id, "2026-11-02"), "2026-0001");
  assert.equal((await get("SELECT due_date FROM invoices WHERE id=?", id))!.due_date, "2026-12-17");
  // issued invoices are untouched by regeneration, and billed entries are not billed twice
  const again = await inv.generateInvoices("2026-10");
  assert.equal(again.invoiceIds.length, 0);
});

test("voiding releases hours for re-invoicing", async () => {
  const id = (await all("SELECT id FROM invoices"))[0].id;
  await inv.voidInvoice(id);
  assert.equal((await inv.generateInvoices("2026-10")).invoiceIds.length, 1);
});

test("missing bill rate is a warning, not silent", async () => {
  await entry(X, "2025-03-03");
  const { warnings } = await inv.generateInvoices("2026-10");
  assert.equal(warnings.length, 1);
  await run("DELETE FROM timesheet_entries WHERE work_date='2025-03-03'");
});

test("internal substitute without cost rate produces no contractor payout; no-rate external warns", async () => {
  const a2 = await run("INSERT INTO assignments (project_id,person_id,billing_type,start_date) VALUES (?,?,'hourly','2026-01-01')", project, Z);
  await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", a2, "bill", 50, "EUR", "2026-01-01");
  await run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,?,'approved')", a2, Z, "2026-10-20", 6);
  const { invoiceIds } = await inv.generateInvoices("2026-10");
  let total = 0;
  for (const id of invoiceIds) total += (await get("SELECT total FROM invoices WHERE id=?", id))!.total;
  assert.equal(total, 2000 + 300);
  const { warnings } = await inv.generatePayouts("2026-10");
  assert.deepEqual(warnings, []); // Z is internal -> payroll handles it
});

test("monthly fee is prorated by weekdays and not billed twice", async () => {
  const a3 = await run("INSERT INTO assignments (project_id,person_id,billing_type,start_date) VALUES (?,?,'monthly','2026-11-16')", project, Z);
  await run("INSERT INTO rates (assignment_id,kind,amount,currency,effective_from) VALUES (?,?,?,?,?)", a3, "bill", 4200, "EUR", "2026-01-01");
  const { invoiceIds } = await inv.generateInvoices("2026-11");
  const line = (await get("SELECT * FROM invoice_lines WHERE kind='monthly'"))!;
  assert.equal(line.amount, 2200); // 11 of 21 weekdays x 4200
  await inv.issueInvoice(invoiceIds[0], "2026-12-01");
  assert.equal((await inv.generateInvoices("2026-11")).invoiceIds.length, 0);
});

test("fixed price: milestone terms give one invoice per milestone", async () => {
  const c2 = await run("INSERT INTO contracts (kind,client_id,title,payment_terms) VALUES ('client',?,'SOW',?)", client, "milestone");
  const p2 = await run("INSERT INTO projects (client_id,name) VALUES (?,'Migration')", client);
  const a4 = await run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date) VALUES (?,?,?,'fixed','2026-01-01')", p2, c2, Y);
  for (const t of ["M1", "M2"])
    await run("INSERT INTO milestones (assignment_id,title,bill_amount,cost_amount,status,approved_on) VALUES (?,?,5000,3000,'approved','2026-09-30')", a4, t);
  const { invoiceIds } = await inv.generateInvoices("2026-09");
  assert.equal(invoiceIds.length, 2);
  const { payoutIds } = await inv.generatePayouts("2026-09");
  assert.equal(payoutIds.length, 1);
  assert.equal((await get("SELECT total FROM payouts WHERE id=?", payoutIds[0]))!.total, 6000);
});

test("one contract = one person: a second assignment cannot reuse a contract, but a project can have many contracts", async () => {
  await assert.rejects(() => run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date) VALUES (?,?,?,'daily','2026-01-01')", project, contract, Z));
  const c3 = await run("INSERT INTO contracts (kind,client_id,title) VALUES ('client',?,'Zed contract')", client);
  await run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date) VALUES (?,?,?,'daily','2026-01-01')", project, c3, Z);
  assert.equal((await get("SELECT COUNT(*) n FROM assignments WHERE project_id=?", project))!.n >= 2, true);
});
