import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
const { run, get } = await import("../lib/db.ts");
const hol = await import("../lib/holidays.ts");
const leave = await import("../lib/leave.ts");

const admin = { id: 1, name: "Boss" };
const futureMonday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 70 + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
const add = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wed = add(futureMonday, 2);   // a Wednesday that is a public holiday in Italy only
const y = Number(futureMonday.slice(0, 4));

const mkPerson = (name: string, country: string | null) => run("INSERT INTO people (name,email,worker_type,stage,country,holiday_country) VALUES (?,?,'external','placed','Albania',?)", name, `${name.toLowerCase()}@x.com`, country);
const mkUser = async (pid: number, name: string) => ({ id: await run("INSERT INTO users (email,name,password_hash,role,person_id) VALUES (?,?,'x','worker',?)", `${name.toLowerCase()}@x.com`, name, pid), email: `${name.toLowerCase()}@x.com`, name, role: "worker" as const, person_id: pid });
const itPerson = await mkPerson("Gianni", "IT");   // lives in Albania, follows Italian holidays
const alPerson = await mkPerson("Besa", "AL");     // follows Albanian holidays
const nonePerson = await mkPerson("Nora", null);
const gianni = await mkUser(itPerson, "Gianni"), besa = await mkUser(alPerson, "Besa"), nora = await mkUser(nonePerson, "Nora");

test("pure counting skips weekends and the given holidays", () => {
  assert.equal(hol.workingDaysWith("2026-11-02", "2026-11-06", new Map()), 5);
  assert.equal(hol.workingDaysWith("2026-11-02", "2026-11-06", new Map([["2026-11-04", "x"]])), 4);
  assert.equal(hol.workingDaysWith("2026-11-07", "2026-11-08", new Map([["2026-11-07", "Sat holiday"]])), 0);
});

test("holiday lines: ISO and European date formats, errors are reported and nothing is half-saved", async () => {
  const ok = hol.parseHolidayLines("2026-12-25 Christmas Day\n26.12.2026 St Stephen's Day\n\n1/1/2027, New Year");
  assert.deepEqual(ok.rows.map((r) => r.day), ["2026-12-25", "2026-12-26", "2027-01-01"]);
  assert.equal(ok.errors.length, 0);
  assert.equal(hol.parseHolidayLines("2026-02-30 Nope").errors.length, 1);
  const r = await hol.addHolidaysBulk(admin, "IT", "2026-12-25 Natale\nbroken line");
  assert.equal(r.ok, false);
  assert.equal((await get<any>("SELECT COUNT(*) n FROM holidays"))!.n, 0);
});

test("a person follows the calendar of their holiday country, not where they live", async () => {
  assert.equal((await hol.addHoliday(admin, "IT", wed, "Festa italiana") as any).ok, true);
  assert.equal(((await hol.personHolidays(itPerson, futureMonday, add(futureMonday, 6))) as Map<string, string>).size, 1);
  assert.equal((await hol.personHolidays(alPerson, futureMonday, add(futureMonday, 6))).size, 0);
  assert.equal((await hol.personHolidays(nonePerson, futureMonday, add(futureMonday, 6))).size, 0);
});

test("leave days exclude the person's own public holidays", async () => {
  const fri = add(futureMonday, 4);
  const a = await leave.createLeave(gianni, { personId: itPerson, type: "vacation", from: futureMonday, to: fri });
  const b = await leave.createLeave(besa, { personId: alPerson, type: "vacation", from: futureMonday, to: fri });
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", (a as any).id))!.days, 4);   // Wednesday is Italian holiday
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", (b as any).id))!.days, 5);
  const bal = await leave.leaveBalance(itPerson, y);
  assert.equal(bal.pending, 4);
  assert.equal(bal.remainingIfPending, leave.DEFAULT_LEAVE_DAYS - 4);
});

test("a request that covers only public holidays or weekends is refused", async () => {
  const only = add(futureMonday, 14 + 2);
  await hol.addHoliday(admin, "IT", only, "Another holiday");
  const r = await leave.createLeave(gianni, { personId: itPerson, type: "vacation", from: only, to: only });
  assert.match((r as any).error, /public holidays/);
});

test("adding a holiday later updates existing requests; changing the person's country does too", async () => {
  const start = add(futureMonday, 28);
  const r = await leave.createLeave(nora, { personId: nonePerson, type: "vacation", from: start, to: add(start, 4) });
  const id = (r as any).id;
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", id))!.days, 5);
  await hol.addHoliday(admin, "IT", add(start, 1), "Late addition");
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", id))!.days, 5);              // Nora follows no calendar
  assert.equal((await hol.setHolidayCountry(admin, nonePerson, "IT") as any).ok, true);
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", id))!.days, 4);              // now she does
  await hol.deleteHoliday(admin, "IT", add(start, 1));
  assert.equal((await get<any>("SELECT days FROM leave WHERE id=?", id))!.days, 5);
  assert.equal((await get<any>("SELECT reason, summary FROM audit_log WHERE entity='person' ORDER BY id DESC LIMIT 1"))!.summary.includes("Italy"), true);
});

test("copy a year forward keeps month and day; invalid country or date is refused", async () => {
  await hol.addHoliday(admin, "AL", `${y}-03-14`, "Summer Day");
  await hol.addHoliday(admin, "AL", `${y}-11-28`, "Independence Day");
  const c = await hol.copyHolidayYear(admin, "AL", y, y + 1);
  assert.deepEqual({ ok: c.ok, copied: (c as any).copied }, { ok: true, copied: 2 });
  assert.deepEqual((await hol.holidaysIn("AL", y + 1)).map((h) => h.day), [`${y + 1}-03-14`, `${y + 1}-11-28`]);
  assert.match((await hol.addHoliday(admin, "", "2026-01-01", "x") as any).error, /country/);
  assert.match((await hol.addHoliday(admin, "IT", "01/01/2026", "x") as any).error, /YYYY-MM-DD/);
  assert.equal(hol.countryName("IT"), "Italy");
  assert.equal(hol.countryName("AL"), "Albania");
});
