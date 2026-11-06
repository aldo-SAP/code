import test from "node:test";
import assert from "node:assert/strict";

await (await import("./_setup.ts")).useTestDb();
process.env.APP_SECRET = "test-secret-for-encryption";
const t = await import("../lib/totp.ts");
const { run, get } = await import("../lib/db.ts");
const mfa = await import("../lib/mfa.ts");
const auth = await import("../lib/auth.ts");

// RFC 6238 appendix B: secret "12345678901234567890", SHA-1
const RFC_SECRET = t.base32Encode(Buffer.from("12345678901234567890"));

test("matches the RFC 6238 test vectors (8 digits) and the 6-digit truncation", () => {
  assert.equal(t.totpAt(RFC_SECRET, 59_000, 8), "94287082");
  assert.equal(t.totpAt(RFC_SECRET, 1111111109_000, 8), "07081804");
  assert.equal(t.totpAt(RFC_SECRET, 1234567890_000, 8), "89005924");
  assert.equal(t.totpAt(RFC_SECRET, 59_000, 6), "287082");
});

test("base32 round trip and rejection of bad characters", () => {
  const b = Buffer.from([0, 1, 2, 250, 255, 128, 77]);
  assert.deepEqual(t.base32Decode(t.base32Encode(b)), b);
  assert.deepEqual(t.base32Decode("gezd gnbv gy3t qojq"), t.base32Decode("GEZDGNBVGY3TQOJQ"));
  assert.throws(() => t.base32Decode("not*valid"));
  assert.equal(t.generateSecret().length, 32);
});

test("codes are accepted one step either side, never further, and never twice", () => {
  const now = 1_700_000_000_000;
  const code = (offsetSteps: number) => t.totpAt(RFC_SECRET, now + offsetSteps * 30_000);
  assert.equal(t.verifyTotp(RFC_SECRET, code(0), now), t.stepAt(now));
  assert.equal(t.verifyTotp(RFC_SECRET, code(-1), now), t.stepAt(now) - 1);
  assert.equal(t.verifyTotp(RFC_SECRET, code(1), now), t.stepAt(now) + 1);
  assert.equal(t.verifyTotp(RFC_SECRET, code(2), now), null);
  assert.equal(t.verifyTotp(RFC_SECRET, code(0), now, t.stepAt(now)), null);      // already used
  assert.equal(t.verifyTotp(RFC_SECRET, "12345", now), null);
  assert.equal(t.verifyTotp(RFC_SECRET, "abcdef", now), null);
  assert.equal(t.verifyTotp(RFC_SECRET, code(0).slice(0, 3) + " " + code(0).slice(3), now), t.stepAt(now)); // spaces are fine
});

test("otpauth link carries the secret and issuer; recovery codes look right and are distinct", () => {
  const u = t.otpauthUri("a@b.com", "ABCDEFGH");
  assert.match(u, /^otpauth:\/\/totp\/Talent%20CRM:a%40b\.com\?secret=ABCDEFGH&issuer=Talent%20CRM/);
  const codes = t.generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0], /^[a-z2-7]{5}-[a-z2-7]{5}$/);
});

test("stored secrets are encrypted and tamper-evident", () => {
  const enc = auth.encryptSecret("JBSWY3DPEHPK3PXP");
  assert.doesNotMatch(enc, /JBSWY3DP/);
  assert.equal(auth.decryptSecret(enc), "JBSWY3DPEHPK3PXP");
  const parts = enc.split("."); parts[2] = Buffer.from("x" + Buffer.from(parts[2], "base64url").toString("latin1").slice(1), "latin1").toString("base64url");
  assert.throws(() => auth.decryptSecret(parts.join(".")));
});

const user = await run("INSERT INTO users (email,name,password_hash,role) VALUES ('freelancer@x.com','Free','x','worker')");
const actor = { id: user, name: "Free" };
const nowCode = (secret: string, off = 0) => t.totpAt(secret, Date.now() + off * 30_000);

test("enrolment: wrong code refused, right code turns it on and shows recovery codes once", async () => {
  const secret = await mfa.beginEnrollment(user);
  assert.equal(await mfa.beginEnrollment(user), secret);                                   // resuming gives the same secret
  assert.equal((await get<any>("SELECT totp_pending FROM users WHERE id=?", user))!.totp_pending.includes(secret), false); // stored encrypted
  assert.equal((await mfa.confirmEnrollment(actor, "000000")).ok, false);
  const r = await mfa.confirmEnrollment(actor, nowCode(secret));
  assert.equal(r.ok, true);
  assert.equal((r as any).codes.length, 10);
  assert.deepEqual(await mfa.mfaStatus(user), { enabled: true, recoveryLeft: 10 });
  assert.equal((await get<any>("SELECT COUNT(*) n FROM recovery_codes WHERE code_hash LIKE '%-%'"))!.n, 0); // only hashes are stored
});

test("sign-in: a code works once; the same code again, or a wrong one, fails", async () => {
  const secret = auth.decryptSecret((await get<any>("SELECT totp_secret FROM users WHERE id=?", user))!.totp_secret);
  const next = nowCode(secret, 1);                       // a step ahead of the one used at enrolment
  assert.deepEqual(await mfa.verifyMfa(user, next), { ok: true, method: "totp" });
  assert.deepEqual(await mfa.verifyMfa(user, next), { ok: false });
  assert.deepEqual(await mfa.verifyMfa(user, "123456"), { ok: false });
});

test("recovery codes work exactly once each", async () => {
  const secret = auth.decryptSecret((await get<any>("SELECT totp_secret FROM users WHERE id=?", user))!.totp_secret);
  const fresh = await mfa.regenerateRecovery(actor, nowCode(secret, 1 + 0) /* already used step */);
  assert.equal(fresh.ok, false);                                                            // same step cannot be reused
  await run("UPDATE users SET totp_last_step=0 WHERE id=?", user);
  const r = await mfa.regenerateRecovery(actor, nowCode(secret));
  assert.equal(r.ok, true);
  const codes = (r as any).codes as string[];
  const ok = await mfa.verifyMfa(user, codes[0].toUpperCase().replace("-", " "));           // case and separators are forgiven
  assert.deepEqual(ok, { ok: true, method: "recovery", recoveryLeft: 9 });
  assert.deepEqual(await mfa.verifyMfa(user, codes[0]), { ok: false });                     // used
  assert.deepEqual(await mfa.verifyMfa(user, "aaaaa-aaaaa"), { ok: false });
});

test("turning it off needs a valid code; an admin can reset a lost phone; both are logged", async () => {
  await run("UPDATE users SET totp_last_step=0 WHERE id=?", user);
  assert.equal((await mfa.disableMfa(actor, "000000")).ok, false);
  const secret = auth.decryptSecret((await get<any>("SELECT totp_secret FROM users WHERE id=?", user))!.totp_secret);
  assert.equal((await mfa.disableMfa(actor, nowCode(secret))).ok, true);
  assert.equal((await mfa.mfaStatus(user)).enabled, false);
  const s2 = await mfa.beginEnrollment(user);
  await run("UPDATE users SET totp_last_step=0 WHERE id=?", user);
  assert.equal((await mfa.confirmEnrollment(actor, nowCode(s2))).ok, true);
  await mfa.adminResetMfa({ id: 99, name: "Boss" }, user);
  assert.deepEqual(await mfa.mfaStatus(user), { enabled: false, recoveryLeft: 0 });
  const log = (await get<any>("SELECT user_name FROM audit_log WHERE action='mfa_reset'"))!;
  assert.equal(log.user_name, "Boss");
  assert.ok(await get("SELECT 1 FROM audit_log WHERE action='mfa_enabled'") && await get("SELECT 1 FROM audit_log WHERE action='mfa_disabled'"));
});

test("policy: off by default; privileged means admins and managers; all means everyone", async () => {
  assert.equal(await mfa.mfaRequiredFor("admin"), false);
  await run("INSERT INTO settings (key,value) VALUES ('mfa_policy','privileged') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
  assert.deepEqual([await mfa.mfaRequiredFor("admin"), await mfa.mfaRequiredFor("manager"), await mfa.mfaRequiredFor("worker")], [true, true, false]);
  await run("UPDATE settings SET value='all' WHERE key='mfa_policy'");
  assert.equal(await mfa.mfaRequiredFor("worker"), true);
  await run("UPDATE settings SET value='bogus' WHERE key='mfa_policy'");
  assert.equal(await mfa.mfaPolicy(), "off");
});
