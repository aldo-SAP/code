import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
process.env.APP_URL = "https://crm.example.com";
const { run, all, get } = await import("../lib/db.ts");
const leave = await import("../lib/leave.ts");
const mail = await import("../lib/mail.ts");

// dates relative to today, always a Monday in the future
const monday = (weeksAhead: number) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 7 * weeksAhead + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const wp = await run("INSERT INTO people (name,email,worker_type,stage) VALUES ('Wanda','wanda@x.com','external','placed')");
const mp = await run("INSERT INTO people (name,email,worker_type,stage) VALUES ('Mia','mia@co.com','internal','placed')");
const worker = { id: await run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES ('wanda@x.com','Wanda','x','worker',?)", wp), email: "wanda@x.com", name: "Wanda", role: "worker" as const, person_id: wp };
const manager = { id: await run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES ('mia@co.com','Mia','x','manager',?)", mp), email: "mia@co.com", name: "Mia", role: "manager" as const, person_id: mp };
const admin = { id: await run("INSERT INTO users (email,name,password_hash,role) VALUES ('boss@co.com','Boss','x','admin')"), email: "boss@co.com", name: "Boss", role: "admin" as const, person_id: null };

const sentTo = async (subjectPart: string) => (await all<any>("SELECT to_addr FROM email_outbox WHERE subject LIKE ? ORDER BY to_addr", `%${subjectPart}%`)).map((r) => r.to_addr);

test("vacation request waits for approval and emails the approvers plus a receipt to the worker", async () => {
  const from = monday(3), to = addDays(from, 4);
  const r = await leave.createLeave(worker, { personId: wp, type: "vacation", from, to, notes: "Family trip" });
  assert.deepEqual({ ok: r.ok, status: (r as any).status }, { ok: true, status: "requested" });
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", (r as any).id))!.days, 5);
  assert.deepEqual(await sentTo("Leave request: Wanda"), ["boss@co.com", "mia@co.com"]);
  assert.deepEqual(await sentTo("We received your leave request"), ["wanda@x.com"]);
  const body = (await get<any>("SELECT body FROM email_outbox WHERE subject LIKE 'Leave request%' LIMIT 1"))!.body;
  assert.match(body, /Family trip/);
  assert.match(body, new RegExp(`https://crm.example.com/leave/${(r as any).id}`));
  assert.equal((await get<any>("SELECT status FROM email_outbox LIMIT 1"))!.status, "skipped"); // no provider configured in tests
});

test("invalid or conflicting requests are refused", async () => {
  const from = monday(3);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: addDays(from, 2), to: addDays(from, 6) }) as any).error, /overlaps/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: addDays(monday(6), 5), to: addDays(monday(6), 6) }) as any).error, /no working days/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: "2020-01-06", to: "2020-01-07" }) as any).error, /past/);
  assert.match((await leave.createLeave(worker, { personId: mp, type: "vacation", from: monday(8), to: monday(8) }) as any).error, /yourself/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "holiday", from: monday(8), to: monday(8) }) as any).error, /manager/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: monday(8), to: addDays(monday(8), -1) }) as any).error, /dates/);
});

test("sick leave is recorded at once and the approvers are told", async () => {
  const d = monday(10);
  const r = await leave.createLeave(worker, { personId: wp, type: "sick", from: d, to: d });
  assert.equal((r as any).status, "approved");
  assert.deepEqual(await sentTo("Sick leave reported: Wanda"), ["boss@co.com", "mia@co.com"]);
});

test("only managers decide, never on their own request; rejection needs a reason; decisions are final", async () => {
  const id = (await get<any>("SELECT id FROM leave WHERE status='requested' AND person_id=?", wp))!.id;
  assert.match((await leave.decideLeave(worker, id, "approved", "") as any).error, /Only a manager/);
  const own = await leave.createLeave(manager, { personId: mp, type: "vacation", from: monday(12), to: monday(12) });
  assert.equal((own as any).status, "approved"); // managers record their own leave directly...
  await run("UPDATE leave SET status='requested' WHERE id=?", (own as any).id);
  assert.match((await leave.decideLeave(manager, (own as any).id, "approved", "") as any).error, /own request/); // ...but cannot approve it
  assert.match((await leave.decideLeave(admin, id, "rejected", "") as any).error, /reason/);
  assert.equal((await leave.decideLeave(admin, id, "approved", "Enjoy") as any).ok, true);
  assert.deepEqual(await sentTo("Your leave was approved"), ["wanda@x.com"]);
  assert.match((await leave.decideLeave(manager, id, "rejected", "too late") as any).error, /already approved/);
  const log = (await get<any>("SELECT * FROM audit_log WHERE action='leave_approve'"))!;
  assert.equal(log.user_name, "Boss");
  assert.equal(log.reason, "Enjoy");
});

test("worker can cancel own future leave; approvers are told", async () => {
  const id = (await get<any>("SELECT id FROM leave WHERE person_id=? AND type='vacation' AND status='approved' AND from_date>?", wp, new Date().toISOString().slice(0, 10)))!.id;
  assert.equal((await leave.cancelLeave(worker, id) as any).ok, true);
  assert.deepEqual(await sentTo("Leave cancelled: Wanda"), ["boss@co.com", "mia@co.com"]);
  assert.equal((await get<any>("SELECT status FROM leave WHERE id=?", id))!.status, "cancelled");
  assert.match((await leave.cancelLeave(worker, id) as any).error, /already cancelled/);
  // freed dates can be requested again
  assert.equal((await leave.createLeave(worker, { personId: wp, type: "vacation", from: monday(3), to: monday(3) }) as any).ok, true);
});

test("a manager recording leave for someone approves it directly and tells them", async () => {
  const r = await leave.createLeave(admin, { personId: wp, type: "holiday", from: monday(14), to: monday(14), notes: "Bank holiday" });
  assert.equal((r as any).status, "approved");
  assert.deepEqual(await sentTo("Leave recorded for you"), ["wanda@x.com"]);
});

test("approver list can be configured and the requester is left out", async () => {
  await run("INSERT INTO settings (key,value) VALUES ('leave_approver_emails','pm1@co.com; pm2@co.com') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
  assert.deepEqual(await leave.approverEmails(), ["pm1@co.com", "pm2@co.com"]);
  assert.deepEqual(await leave.approverEmails("pm1@co.com"), ["pm2@co.com"]);
  await run("DELETE FROM settings WHERE key='leave_approver_emails'");
});

test("mail: Microsoft Graph and Resend requests have the right shape; failures are recorded, not thrown", async () => {
  const calls: { url: string; init: any }[] = [];
  const ok = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return String(url).includes("/token") ? new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 }) : new Response("", { status: 202 });
  }) as typeof fetch;
  const graphEnv = { MAIL_PROVIDER: "graph", MS_TENANT_ID: "t", MS_CLIENT_ID: "c", MS_CLIENT_SECRET: "s", MAIL_SENDER: "crm@co.com" };
  assert.equal(mail.mailProvider(graphEnv), "graph");
  await mail.deliver("a@b.com", "Hi <you>", "Line 1\n\nSee https://x.test/p", graphEnv, ok);
  assert.match(calls[1].url, /\/users\/crm%40co\.com\/sendMail$/);
  assert.equal(calls[1].init.headers.authorization, "Bearer tok");
  const sent = JSON.parse(calls[1].init.body);
  assert.equal(sent.message.toRecipients[0].emailAddress.address, "a@b.com");
  assert.match(sent.message.body.content, /<a href="https:\/\/x.test\/p">/);

  const resend = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response("", { status: 200 }); }) as typeof fetch;
  await mail.deliver("a@b.com", "S", "T", { MAIL_PROVIDER: "resend", RESEND_API_KEY: "k", MAIL_FROM: "crm@co.com" }, resend);
  assert.equal(calls.at(-1)!.url, "https://api.resend.com/emails");

  const bad = (async () => new Response("denied", { status: 403 })) as typeof fetch;
  await mail.sendMail(["fail@co.com", "not-an-address", "FAIL@co.com"], "Subj", "Body", "t", { MAIL_PROVIDER: "resend", RESEND_API_KEY: "k", MAIL_FROM: "f@co.com" }, bad);
  const rows = await all<any>("SELECT * FROM email_outbox WHERE to_addr='fail@co.com'");
  assert.equal(rows.length, 1);                      // duplicates and invalid addresses dropped
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error, /403/);
  await mail.retryMail(rows[0].id, { MAIL_PROVIDER: "resend", RESEND_API_KEY: "k", MAIL_FROM: "f@co.com" }, resend);
  assert.equal((await get<any>("SELECT status,attempts FROM email_outbox WHERE id=?", rows[0].id))!.status, "sent");
});
