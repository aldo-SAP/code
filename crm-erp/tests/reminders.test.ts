import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
const { run, all } = await import("../lib/db.ts");
const r = await import("../lib/reminders.ts");
const f = await import("../lib/forecast.ts");

const client = await run("INSERT INTO clients (name) VALUES ('Acme')");
const pr = await run("INSERT INTO projects (client_id,name) VALUES (?,'Portal')", client);
const mk = (n: string, email: string | null) => run("INSERT INTO people (name,email,worker_type,stage) VALUES (?,?,'external','placed')", n, email);
const [A, B, C, D] = [await mk("Ana", "ana@x.test"), await mk("Bo", "bo@x.test"), await mk("Cy", null), await mk("Di", "di@x.test")];
const asg = async (p: number) => run("INSERT INTO assignments (project_id,person_id,billing_type,start_date) VALUES (?,?,'hourly','2026-01-01')", pr, p);
const aids: Record<number, number> = {};
for (const p of [A, B, C, D]) aids[p] = await asg(p);
const ent = (p: number, d: string, st: string) => run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,8,?)", aids[p], p, d, st);
await ent(A, "2026-03-02", "draft"); await ent(B, "2026-03-02", "approved"); await ent(D, "2026-03-02", "submitted");

test("who still owes hours", async () => {
  const s = await r.monthStatus("2026-03");
  const st = Object.fromEntries(s.map((p) => [p.name, p.state]));
  assert.deepEqual(st, { Ana: "draft", Bo: "done", Cy: "nothing", Di: "waiting" });
});
test("reminders go only to people who owe hours, have an email, and not twice in a row", async () => {
  const first = await r.sendReminders("2026-03");
  assert.deepEqual(first.sent, ["Ana"]); assert.deepEqual(first.skipped, ["Cy (no email)"]);
  const again = await r.sendReminders("2026-03");
  assert.deepEqual(again.sent, []); assert.ok(again.skipped.includes("Ana (reminded recently)"));
  const out = await all<any>("SELECT to_addr FROM email_outbox WHERE related LIKE 'reminder:%'");
  assert.deepEqual(out.map((o) => o.to_addr), ["ana@x.test"]);
});
test("checklist counts", async () => {
  const c = await r.checklist("2026-03");
  assert.equal(c.needSubmit, 2); assert.equal(c.waitingApproval, 1); assert.equal(c.approvedNotInvoiced, 1);
});
test("forecast: an assignment that ends frees the person afterwards", async () => {
  await run("UPDATE assignments SET end_date='2026-04-30' WHERE id=?", aids[C]);
  const t = await f.forecast("2026-04", 3);
  const cy = t.people.find((p) => p.name === "Cy")!;
  assert.equal(cy.months[0].free, 0); assert.ok(cy.months[0].assigned > 0);
  assert.equal(cy.months[1].assigned, 0); assert.equal(cy.months[1].free, cy.months[1].workDays);
  assert.equal(cy.freeFrom, "2026-05-01"); assert.equal(cy.ending[0].end, "2026-04-30");
  assert.equal(t.people.find((p) => p.name === "Ana")!.freeFrom, null);        // open-ended assignment
});
