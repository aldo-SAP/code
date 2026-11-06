import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
process.env.APP_URL = "https://crm.example.com";
const { run, all, get } = await import("../lib/db.ts");
const leave = await import("../lib/leave.ts");
const mail = await import("../lib/mail.ts");

// dates relative to today: a Monday weeksAhead weeks from now
const monday = (weeksAhead: number) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 7 * weeksAhead + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const year = Number(monday(3).slice(0, 4));

const wp = await run("INSERT INTO people (name,email,worker_type,stage) VALUES ('Wanda','wanda@x.com','external','placed')");
const mp = await run("INSERT INTO people (name,email,worker_type,stage) VALUES ('Mia','mia@co.com','internal','placed')");
const worker = { id: await run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES ('wanda@x.com','Wanda','x','worker',?)", wp), email: "wanda@x.com", name: "Wanda", role: "worker" as const, person_id: wp };
const manager = { id: await run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES ('mia@co.com','Mia','x','manager',?)", mp), email: "mia@co.com", name: "Mia", role: "manager" as const, person_id: mp };
const admin = { id: await run("INSERT INTO users (email,name,password_hash,role) VALUES ('boss@co.com','Boss','x','admin')"), email: "boss@co.com", name: "Boss", role: "admin" as const, person_id: null };

const mails = (thread: string) => all<any>("SELECT * FROM email_outbox WHERE thread_key=? ORDER BY id", thread);
const sorted = (csv: string) => csv.split(",").sort();
let requestId = 0;

test("one email goes to the managers with the employee in copy, and opens the thread", async () => {
  const from = monday(3), to = addDays(from, 4);
  const r = await leave.createLeave(worker, { personId: wp, type: "vacation", from, to, notes: "Family trip" });
  assert.deepEqual({ ok: r.ok, status: (r as any).status }, { ok: true, status: "requested" });
  requestId = (r as any).id;
  const [m, ...rest] = await mails(`leave:${requestId}`);
  assert.equal(rest.length, 0);                                 // one message, not a message per person plus a receipt
  assert.deepEqual(sorted(m.to_addr), ["boss@co.com", "mia@co.com"]);
  assert.equal(m.cc_addr, "wanda@x.com");
  assert.match(m.subject, /^Leave request: Wanda, /);
  assert.match(m.body, /Family trip/);
  assert.match(m.body, new RegExp(`https://crm.example.com/leave/${requestId}`));
  assert.equal(m.status, "skipped");                            // no provider configured in tests
});

test("approving replies in the same thread with the same subject", async () => {
  assert.match((await leave.decideLeave(worker, requestId, "approved", "") as any).error, /Only a manager/);
  assert.equal((await leave.decideLeave(admin, requestId, "approved", "Enjoy") as any).ok, true);
  const msgs = await mails(`leave:${requestId}`);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].subject, msgs[0].subject);
  assert.match(msgs[1].body, /Approved by Boss/);
  assert.match(msgs[1].body, /Note: Enjoy/);
  assert.equal(msgs[1].cc_addr, "wanda@x.com");
  assert.match((await leave.decideLeave(manager, requestId, "rejected", "late") as any).error, /already approved/);
  assert.equal((await get<any>("SELECT user_name, reason FROM audit_log WHERE action='leave_approve'"))!.reason, "Enjoy");
});

test("a manager can later withdraw approved leave: days go back, same thread, reason required", async () => {
  const before = await leave.leaveBalance(wp, year);
  assert.equal(before.planned, 5);
  assert.equal(before.remaining, 15);
  assert.match((await leave.revokeLeave(worker, requestId, "x") as any).error, /Only a manager/);
  assert.match((await leave.revokeLeave(admin, requestId, "") as any).error, /reason/);
  assert.equal((await leave.revokeLeave(admin, requestId, "Client deadline moved up, we need you that week") as any).ok, true);
  const after = await leave.leaveBalance(wp, year);
  assert.deepEqual({ planned: after.planned, remaining: after.remaining }, { planned: 0, remaining: 20 });
  const msgs = await mails(`leave:${requestId}`);
  assert.equal(msgs.length, 3);
  assert.equal(msgs[2].subject, msgs[0].subject);
  assert.match(msgs[2].body, /withdrew the approval/);
  assert.match(msgs[2].body, /5 working days go back/);
  assert.equal((await get<any>("SELECT status FROM leave WHERE id=?", requestId))!.status, "revoked");
  assert.equal((await get<any>("SELECT reason FROM audit_log WHERE action='leave_revoke'"))!.reason, "Client deadline moved up, we need you that week");
  assert.match((await leave.revokeLeave(admin, requestId, "again") as any).error, /Only approved/);
  // the freed days can be requested again
  assert.equal((await leave.createLeave(worker, { personId: wp, type: "vacation", from: monday(3), to: monday(3) }) as any).ok, true);
});

test("leave that already started cannot be withdrawn, and managers cannot withdraw their own", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const past = await run("INSERT INTO leave (person_id,type,from_date,to_date,status,days) VALUES (?,'vacation',?,?, 'approved', 1)", wp, addDays(today, -3), addDays(today, 3));
  assert.match((await leave.revokeLeave(admin, past, "no") as any).error, /already started/);
  const own = await run("INSERT INTO leave (person_id,type,from_date,to_date,status,days) VALUES (?,'vacation',?,?, 'approved', 1)", mp, monday(20), monday(20));
  assert.match((await leave.revokeLeave(manager, own, "no") as any).error, /own leave/);
  await run("DELETE FROM leave WHERE id IN (?,?)", past, own);
});

test("balance: taken, planned and pending split by today; allowance defaults, per-person override and warning beyond it", async () => {
  await run("DELETE FROM leave WHERE person_id=?", wp);
  const today = new Date().toISOString().slice(0, 10);
  const y = Number(today.slice(0, 4));
  await run("INSERT INTO leave (person_id,type,from_date,to_date,status,days) VALUES (?,'vacation',?,?,'approved',5)", wp, `${y}-01-05`, `${y}-01-09`); // past in any test year >= Jan 10
  await run("INSERT INTO leave (person_id,type,from_date,to_date,status,days) VALUES (?,'sick',?,?,'approved',2)", wp, `${y}-01-12`, `${y}-01-13`); // does not consume vacation
  const b = await leave.leaveBalance(wp, y, `${y}-06-15`);
  assert.deepEqual({ allowance: b.allowance, taken: b.taken, planned: b.planned, pending: b.pending, remaining: b.remaining }, { allowance: 20, taken: 5, planned: 0, pending: 0, remaining: 15 });
  assert.equal((await leave.setAllowance(manager, wp, y, 25, "includes 3 carried over days") as any).ok, true);
  assert.equal((await leave.leaveBalance(wp, y, `${y}-06-15`)).remaining, 20);
  assert.match((await leave.setAllowance(worker, wp, y, 99) as any).error, /Only a manager/);
  // asking for more than is left still goes through, with a heads-up for the approver
  await run("DELETE FROM leave WHERE person_id=?", wp);
  await leave.setAllowance(manager, wp, year, 3);
  const r = await leave.createLeave(worker, { personId: wp, type: "vacation", from: monday(5), to: addDays(monday(5), 4) });
  assert.equal((r as any).ok, true);
  assert.match((r as any).warning, /more than the .* allowance/);
  assert.match((await mails(`leave:${(r as any).id}`))[0].body, /Heads up/);
});

test("invalid or conflicting requests are refused", async () => {
  const from = monday(5);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: addDays(from, 2), to: addDays(from, 6) }) as any).error, /overlaps/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: addDays(monday(8), 5), to: addDays(monday(8), 6) }) as any).error, /no working days/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "vacation", from: "2020-01-06", to: "2020-01-07" }) as any).error, /past/);
  assert.match((await leave.createLeave(worker, { personId: mp, type: "vacation", from: monday(9), to: monday(9) }) as any).error, /yourself/);
  assert.match((await leave.createLeave(worker, { personId: wp, type: "holiday", from: monday(9), to: monday(9) }) as any).error, /manager/);
});

test("rules: no self-approval, rejection needs a reason, sick leave is recorded at once, manager-recorded leave is approved", async () => {
  const own = await leave.createLeave(manager, { personId: mp, type: "vacation", from: monday(12), to: monday(12) });
  assert.equal((own as any).status, "approved");
  await run("UPDATE leave SET status='requested' WHERE id=?", (own as any).id);
  assert.match((await leave.decideLeave(manager, (own as any).id, "approved", "") as any).error, /own request/);
  assert.match((await leave.decideLeave(admin, (own as any).id, "rejected", "") as any).error, /reason/);
  const sick = await leave.createLeave(worker, { personId: wp, type: "sick", from: monday(14), to: monday(14) });
  assert.equal((sick as any).status, "approved");
  assert.deepEqual(sorted((await mails(`leave:${(sick as any).id}`))[0].to_addr), ["boss@co.com", "mia@co.com"]);
  const rec = await leave.createLeave(admin, { personId: wp, type: "holiday", from: monday(16), to: monday(16), notes: "Bank holiday" });
  assert.equal((rec as any).status, "approved");
  const m = (await mails(`leave:${(rec as any).id}`))[0];
  assert.deepEqual([m.to_addr, m.cc_addr], ["wanda@x.com", "boss@co.com"]);
});

test("worker cancels own future leave in the same thread", async () => {
  const r = await leave.createLeave(worker, { personId: wp, type: "vacation", from: monday(18), to: monday(18) });
  assert.equal((await leave.cancelLeave(worker, (r as any).id) as any).ok, true);
  const msgs = await mails(`leave:${(r as any).id}`);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].subject, msgs[0].subject);
  assert.match((await leave.cancelLeave(worker, (r as any).id) as any).error, /already cancelled/);
});

test("approver list can be configured and the requester is left out", async () => {
  await run("INSERT INTO settings (key,value) VALUES ('leave_approver_emails','pm1@co.com; pm2@co.com') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
  assert.deepEqual(await leave.approverEmails(), ["pm1@co.com", "pm2@co.com"]);
  assert.deepEqual(await leave.approverEmails("pm1@co.com"), ["pm2@co.com"]);
  await run("DELETE FROM settings WHERE key='leave_approver_emails'");
});

test("timeline data lists every status for the year, oldest first, with the balance", async () => {
  await run("DELETE FROM leave WHERE person_id=?", wp);
  const ins = (type: string, from: string, to: string, status: string) =>
    run("INSERT INTO leave (person_id,type,from_date,to_date,status,days) VALUES (?,?,?,?,?,1)", wp, type, from, to, status);
  await ins("vacation", `${year}-08-03`, `${year}-08-07`, "approved");
  await ins("vacation", `${year}-03-02`, `${year}-03-06`, "revoked");
  await ins("vacation", `${year}-11-02`, `${year}-11-06`, "requested");
  await ins("sick", `${year}-05-04`, `${year}-05-05`, "approved");
  await ins("vacation", `${year - 1}-12-28`, `${year - 1}-12-30`, "approved"); // other year: not in this timeline
  const t = await leave.leaveTimeline(wp, year);
  assert.deepEqual(t.rows.map((r: any) => r.status), ["revoked", "approved", "approved", "requested"]);
  assert.deepEqual(t.rows.map((r: any) => r.from_date.slice(5, 7)), ["03", "05", "08", "11"]);
  assert.equal(t.balance.allowance, 3);                 // the override set earlier in this file
  assert.equal(t.balance.pending, 5);
  assert.equal(t.balance.planned + t.balance.taken, 5); // revoked and sick days do not count
});

// ---------------------------------------------------------------- mail providers (mocked HTTP)

const calls: { url: string; init: any }[] = [];
const graph = (opts: { replyStatus?: number } = {}) => (async (url: any, init: any) => {
  const u = String(url); calls.push({ url: u, init });
  if (u.includes("/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
  if (u.endsWith("/messages")) return new Response(JSON.stringify({ id: "MSG1", internetMessageId: "<root@graph>" }), { status: 201 });
  if (u.endsWith("/send")) return new Response("", { status: 202 });
  if (u.endsWith("/replyAll")) return new Response("", { status: opts.replyStatus ?? 202 });
  return new Response("?", { status: 500 });
}) as typeof fetch;
const graphEnv = { MAIL_PROVIDER: "graph", MS_TENANT_ID: "t", MS_CLIENT_ID: "c", MS_CLIENT_SECRET: "s", MAIL_SENDER: "crm@co.com" };

test("Graph: the first message opens a thread (To manager, Cc employee); later ones are real reply-alls", async () => {
  calls.length = 0;
  await mail.sendMail({ to: ["mgr@co.com"], cc: ["emp@co.com"], subject: "Leave request: Eve", text: "Please decide\nhttps://x.test/leave/9", thread: "t-graph" }, graphEnv, graph());
  const create = calls.find((c) => c.url.endsWith("/messages"))!;
  assert.match(create.url, /\/users\/crm%40co\.com\/messages$/);
  assert.equal(create.init.headers.Prefer, 'IdType="ImmutableId"');
  const draft = JSON.parse(create.init.body);
  assert.equal(draft.toRecipients[0].emailAddress.address, "mgr@co.com");
  assert.equal(draft.ccRecipients[0].emailAddress.address, "emp@co.com");
  assert.match(draft.body.content, /<a href="https:\/\/x.test\/leave\/9">/);
  assert.ok(calls.some((c) => c.url.endsWith("/messages/MSG1/send")));
  assert.equal((await get<any>("SELECT graph_message_id FROM email_threads WHERE thread_key='t-graph'"))!.graph_message_id, "MSG1");

  calls.length = 0;
  await mail.sendMail({ to: ["mgr@co.com"], cc: ["emp@co.com"], subject: "Leave request: Eve", text: "Approved", thread: "t-graph" }, graphEnv, graph());
  assert.equal(calls.filter((c) => c.url.endsWith("/messages")).length, 0);          // no new conversation
  const reply = calls.find((c) => c.url.endsWith("/messages/MSG1/replyAll"))!;
  assert.match(JSON.parse(reply.init.body).message.body.content, /Approved/);
  assert.equal((await all<any>("SELECT status FROM email_outbox WHERE thread_key='t-graph'")).every((r) => r.status === "sent"), true);
});

test("Graph: if the original was deleted the reply falls back to a fresh thread", async () => {
  calls.length = 0;
  await mail.sendMail({ to: ["mgr@co.com"], subject: "Leave request: Eve", text: "Revoked", thread: "t-graph" }, graphEnv, graph({ replyStatus: 404 }));
  assert.ok(calls.some((c) => c.url.endsWith("/replyAll")));
  assert.ok(calls.some((c) => c.url.endsWith("/messages")));
  assert.equal((await get<any>("SELECT status FROM email_outbox WHERE thread_key='t-graph' ORDER BY id DESC LIMIT 1"))!.status, "sent");
});

test("Resend: thread headers, cc, and failures are recorded and retryable", async () => {
  const sent: any[] = [];
  const ok = (async (_u: any, init: any) => { sent.push(JSON.parse(init.body)); return new Response("", { status: 200 }); }) as typeof fetch;
  const env = { MAIL_PROVIDER: "resend", RESEND_API_KEY: "k", MAIL_FROM: "Talent CRM <crm@co.com>" };
  await mail.sendMail({ to: ["mgr@co.com"], cc: ["emp@co.com"], subject: "Leave request: Eve", text: "Hello", thread: "t-resend" }, env, ok);
  await mail.sendMail({ to: ["mgr@co.com"], cc: ["emp@co.com"], subject: "Leave request: Eve", text: "Approved", thread: "t-resend" }, env, ok);
  assert.deepEqual(sent[0].cc, ["emp@co.com"]);
  assert.match(sent[0].headers["Message-ID"], /^<crm-\d+-\w+@co\.com>$/);
  assert.equal(sent[0].headers["In-Reply-To"], undefined);
  assert.equal(sent[1].headers["In-Reply-To"], sent[0].headers["Message-ID"]);
  assert.equal(sent[1].headers["References"], sent[0].headers["Message-ID"] + " " + sent[0].headers["Message-ID"]);
  assert.equal(sent[1].subject, "Re: Leave request: Eve");

  const bad = (async () => new Response("denied", { status: 403 })) as typeof fetch;
  await mail.sendMail({ to: ["fail@co.com", "not-an-address", "FAIL@co.com"], subject: "S", text: "B" }, env, bad);
  const rows = await all<any>("SELECT * FROM email_outbox WHERE to_addr='fail@co.com'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error, /403/);
  await mail.retryMail(rows[0].id, env, ok);
  assert.equal((await get<any>("SELECT status,attempts FROM email_outbox WHERE id=?", rows[0].id))!.status, "sent");
});
