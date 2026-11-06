import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
const { run } = await import("../lib/db.ts");
const team = await import("../lib/team.ts");

const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// a Monday whose Friday is in the same month, well in the future
const MON = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 60); while (d.getUTCDay() !== 1 || d.getUTCDate() > 24) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
const [TUE, WED, THU, FRI] = [1, 2, 3, 4].map((n) => addDays(MON, n));
const period = MON.slice(0, 7);

const client = await run("INSERT INTO clients (name) VALUES ('Acme')");
const p1 = await run("INSERT INTO projects (client_id,name) VALUES (?,'Portal')", client);
const p2 = await run("INSERT INTO projects (client_id,name) VALUES (?,'Reports')", client);
const mk = (name: string, stage: string, skills: string, country: string | null) =>
  run("INSERT INTO people (name,worker_type,stage,skills,holiday_country) VALUES (?,'external',?,?,?)", name, stage, skills, country);
const A = await mk("Ana", "placed", "react, node", "IT");
const B = await mk("Bo", "ready", "react, css", "AL");
const C = await mk("Cy", "placed", "python", "AL");
const D = await mk("Di", "ready", "react node", "AL");
await mk("Student", "training", "react", "AL");                       // students are never shown or suggested
const asg = (p: number, proj: number, type: string) => run("INSERT INTO assignments (project_id,person_id,billing_type,start_date) VALUES (?,?,?,'2026-01-01')", proj, p, type);
const aA = await asg(A, p1, "daily"); await asg(C, p2, "hourly");
const leave = (p: number, from: string, to: string, status = "approved", type = "vacation") =>
  run("INSERT INTO leave (person_id,type,from_date,to_date,status,days) VALUES (?,?,?,?,?,1)", p, type, from, to, status);
await leave(A, MON, FRI);                                            // Ana is off all week
await leave(B, TUE, TUE);                                            // Bo is off on Tuesday
await run("INSERT INTO holidays (country,day,name) VALUES ('IT',?,'Festa') ON CONFLICT DO NOTHING", WED);   // Wednesday is an Italian holiday: Ana follows Italy

test("cells: leave, the person's own holiday, weekends, working and free days", async () => {
  const t = await team.teamMonth(period);
  assert.deepEqual(t.people.map((p) => p.name), ["Ana", "Bo", "Cy", "Di"]);            // no student
  const ana = t.people.find((p) => p.name === "Ana")!;
  assert.equal(ana.cells[MON].state, "off");
  assert.equal(ana.cells[WED].state, "holiday");                                         // the holiday wins over leave: it costs no leave day
  assert.equal(ana.cells[addDays(MON, 5)].state, "weekend");
  assert.equal(ana.cells[addDays(MON, 7)].state, "work");
  assert.equal(t.people.find((p) => p.name === "Bo")!.cells[MON].state, "free");
  assert.equal(t.people.find((p) => p.name === "Cy")!.cells[MON].state, "work");
  assert.deepEqual(t.offPerDay[TUE], { off: 2, pending: 0 });                           // Ana and Bo
  assert.deepEqual(t.offPerDay[WED], { off: 0, pending: 0 });
});

test("a gap lists only working days with nobody covering, as separate ranges", async () => {
  const t = await team.teamMonth(period);
  assert.equal(t.gaps.length, 1);
  const g = t.gaps[0];
  assert.deepEqual({ person: g.person, project: g.project, billing: g.billing }, { person: "Ana", project: "Portal", billing: "daily" });
  assert.deepEqual(g.uncovered, [MON, TUE, THU, FRI]);                                   // Wednesday is her holiday
  assert.deepEqual(g.ranges.map((r) => [r.from, r.to, r.days]), [[MON, TUE, 2], [THU, FRI, 2]]);
});

test("candidates: free days first, then shared skills, students excluded", async () => {
  const g = (await team.teamMonth(period)).gaps[0];
  assert.deepEqual(g.candidates.map((c) => c.name), ["Di", "Cy", "Bo"]);
  const [di, cy, bo] = g.candidates;
  assert.equal(di.freeDays, 4); assert.deepEqual(di.sharedSkills.sort(), ["node", "react"]); assert.equal(di.onBench, true);
  assert.equal(cy.freeDays, 4); assert.equal(cy.onBench, false); assert.match(cy.note, /already on Reports/);
  assert.equal(bo.freeDays, 3);                                                          // off on Tuesday
});

test("someone already covering elsewhere or on leave is not free", async () => {
  const aC = (await run("INSERT INTO assignments (project_id,person_id,billing_type,start_date) VALUES (?,?,'daily','2026-01-01')", p2, B)) as number;
  void aC;
  await run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date) VALUES (?,?,?,?)", aA, D, MON, TUE);   // Di covers Ana on Mon-Tue
  const t = await team.teamMonth(period);
  const ana = t.gaps.find((g) => g.person === "Ana")!;
  assert.deepEqual(ana.uncovered, [THU, FRI]);                                            // only Thu-Fri still open
  assert.deepEqual(t.gaps.find((g) => g.person === "Bo")?.uncovered, [TUE]);              // Bo (now on Reports) is off Tuesday: a gap of his own
  assert.equal(t.people.find((p) => p.name === "Di")!.cells[MON].state, "cover");
  assert.equal(t.people.find((p) => p.name === "Di")!.cells[THU].state, "free");
  assert.ok(ana.candidates.map((c) => c.name).includes("Di"));
});

test("once every working day is covered the gap disappears", async () => {
  await run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date) VALUES (?,?,?,?)", aA, D, THU, FRI);
  const t = await team.teamMonth(period);
  assert.equal(t.gaps.some((g) => g.person === "Ana"), false);
});

test("waiting requests show as pending and still raise a gap; project filter narrows the view", async () => {
  await leave(C, THU, THU, "requested");
  const t = await team.teamMonth(period);
  assert.equal(t.people.find((p) => p.name === "Cy")!.cells[THU].state, "pending");
  assert.deepEqual(t.offPerDay[THU], { off: 1, pending: 1 });                           // Ana is off, Cy is waiting
  const gap = t.gaps.find((g) => g.person === "Cy")!;
  assert.equal(gap.status, "requested");
  assert.equal(gap.billing, "hourly");
  const reports = await team.teamMonth(period, { projectId: p2 });
  assert.deepEqual(reports.people.map((p) => p.name), ["Bo", "Cy"]);
  assert.deepEqual(reports.gaps.map((g) => g.person).sort(), ["Bo", "Cy"]);
});
