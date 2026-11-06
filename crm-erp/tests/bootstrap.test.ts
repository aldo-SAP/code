import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
const { get, all } = await import("../lib/db.ts");
const { bootstrapAdmin } = await import("../lib/bootstrap.ts");

test("no variable, no admin", async () => {
  assert.equal(await bootstrapAdmin({} as any), false);
  assert.equal((await all("SELECT * FROM users")).length, 0);
});

test("first start creates a Microsoft-only admin; running again changes nothing", async () => {
  assert.equal(await bootstrapAdmin({ BOOTSTRAP_ADMIN_EMAIL: " Boss@Company.com ", BOOTSTRAP_ADMIN_NAME: "Boss" } as any), true);
  const u = (await get<any>("SELECT * FROM users"))!;
  assert.equal(u.email, "boss@company.com");
  assert.equal(u.role, "admin");
  assert.equal(u.auth_method, "microsoft");
  assert.equal(await bootstrapAdmin({ BOOTSTRAP_ADMIN_EMAIL: "other@company.com" } as any), false);
  assert.equal((await all("SELECT * FROM users")).length, 1);
});
