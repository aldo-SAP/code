import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";

await (await import("./_setup.ts")).useTestDb();
const { run, get } = await import("../lib/db.ts");
const ms = await import("../lib/msauth.ts");

const cfg = ms.msConfig({ MS_TENANT_ID: "tenant-1", MS_CLIENT_ID: "client-1", MS_CLIENT_SECRET: "s", APP_URL: "https://crm.example.com/" } as any)!;
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const keys = createLocalJWKSet({ keys: [jwk] });
const other = await generateKeyPair("RS256");

const token = (over: Record<string, unknown> = {}, opts: { key?: any; iss?: string; aud?: string; exp?: string } = {}) =>
  new SignJWT({ tid: "tenant-1", oid: "oid-1", preferred_username: "Ana@Company.com", name: "Ana", nonce: "n1", ...over })
    .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(opts.iss ?? "https://login.microsoftonline.com/tenant-1/v2.0")
    .setAudience(opts.aud ?? "client-1").setIssuedAt().setExpirationTime(opts.exp ?? "5m").sign(opts.key ?? privateKey);

test("config is off without all four settings; callback url derives from APP_URL", async () => {
  assert.equal(ms.msConfig({ MS_TENANT_ID: "t" } as any), null);
  assert.equal(ms.redirectUri(cfg), "https://crm.example.com/auth/microsoft/callback");
});

test("authorize url carries PKCE, state, nonce and our tenant", async () => {
  const f = ms.newFlow(); const u = new URL(ms.authorizeUrl(cfg, f));
  assert.equal(u.pathname, "/tenant-1/oauth2/v2.0/authorize");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("state"), f.state);
  assert.equal(u.searchParams.get("nonce"), f.nonce);
});

test("valid token is accepted and email is lower-cased", async () => {
  const c = await ms.verifyIdToken(await token(), cfg, "n1", keys);
  assert.deepEqual(c, { oid: "oid-1", email: "ana@company.com", name: "Ana" });
});

test("tokens that are forged, for another app/tenant, expired or replayed are rejected", async () => {
  const bad = async (t: Promise<string>, nonce = "n1") => assert.rejects(ms.verifyIdToken(await t, cfg, nonce, keys));
  await bad(token({}, { key: other.privateKey }));          // wrong signing key
  await bad(token({}, { aud: "someone-else" }));            // wrong audience
  await bad(token({}, { iss: "https://login.microsoftonline.com/other-tenant/v2.0" }));
  await bad(token({ tid: "other-tenant" }));                // tenant claim mismatch
  await bad(token({}, { exp: "-5m" }));                     // expired
  await bad(token(), "different-nonce");                    // replay / wrong flow
});

test("only pre-created users can sign in, and the oid gets bound on first use", async () => {
  await run("INSERT INTO users (email,name,password_hash,role,auth_method) VALUES ('ana@company.com','Ana','x','admin','microsoft')");
  await run("INSERT INTO users (email,name,password_hash,role,auth_method) VALUES ('pw@company.com','Pw','x','worker','password')");
  await run("INSERT INTO users (email,name,password_hash,role,auth_method,active) VALUES ('off@company.com','Off','x','worker','microsoft',0)");
  const ok = await ms.resolveUser({ oid: "oid-1", email: "ana@company.com", name: "Ana" });
  assert.equal(ok.ok && ok.user.role, "admin");
  assert.equal((await get("SELECT ms_oid FROM users WHERE email='ana@company.com'"))!.ms_oid, "oid-1");
  // later matches on oid even if the email changed in Microsoft
  assert.equal((await ms.resolveUser({ oid: "oid-1", email: "ana.new@company.com", name: "Ana" })).ok, true);
  assert.equal((await ms.resolveUser({ oid: "oid-9", email: "stranger@company.com", name: "S" })).ok, false);
  assert.equal((await ms.resolveUser({ oid: "oid-2", email: "pw@company.com", name: "P" })).ok, false);   // password-only account
  assert.equal((await ms.resolveUser({ oid: "oid-3", email: "off@company.com", name: "O" })).ok, false);  // deactivated
  assert.equal((await ms.resolveUser({ oid: "oid-evil", email: "ana@company.com", name: "A" })).ok, false); // email already bound to another oid
});
