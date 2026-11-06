import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { get, run } from "./db.ts";
import type { User } from "./auth.ts";

/** Single-tenant Microsoft Entra ID sign-in (OpenID Connect, authorization code + PKCE). */
export interface MsConfig { tenant: string; clientId: string; clientSecret: string; appUrl: string; authority: string }

export function msConfig(env = process.env): MsConfig | null {
  const { MS_TENANT_ID: tenant, MS_CLIENT_ID: clientId, MS_CLIENT_SECRET: clientSecret, APP_URL: appUrl } = env;
  if (!tenant || !clientId || !clientSecret || !appUrl) return null;
  return { tenant, clientId, clientSecret, appUrl: appUrl.replace(/\/$/, ""), authority: (env.MS_AUTHORITY || "https://login.microsoftonline.com").replace(/\/$/, "") };
}
export const redirectUri = (c: MsConfig) => `${c.appUrl}/auth/microsoft/callback`;

export function newFlow() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(16).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function authorizeUrl(c: MsConfig, f: { state: string; nonce: string; challenge: string }): string {
  const u = new URL(`${c.authority}/${c.tenant}/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: c.clientId, response_type: "code", redirect_uri: redirectUri(c), response_mode: "query",
    scope: "openid profile email", state: f.state, nonce: f.nonce, code_challenge: f.challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return u.toString();
}

export async function exchangeCode(c: MsConfig, code: string, verifier: string): Promise<string> {
  const res = await fetch(`${c.authority}/${c.tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri(c), code_verifier: verifier, scope: "openid profile email" }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.id_token) throw new Error(body.error_description ? String(body.error_description).split("\r")[0] : "Microsoft did not return a sign-in token");
  return body.id_token;
}

let jwks: JWTVerifyGetKey | undefined;
export const remoteJwks = (c: MsConfig): JWTVerifyGetKey => (jwks ??= createRemoteJWKSet(new URL(`${c.authority}/${c.tenant}/discovery/v2.0/keys`)));

export interface Claims { oid: string; email: string; name: string }

/** Checks signature, issuer (our tenant), audience (our app), expiry, nonce and tenant id. Throws on any mismatch. */
export async function verifyIdToken(idToken: string, c: MsConfig, nonce: string, keys: JWTVerifyGetKey = remoteJwks(c)): Promise<Claims> {
  const { payload } = await jwtVerify(idToken, keys, { issuer: `${c.authority}/${c.tenant}/v2.0`, audience: c.clientId, algorithms: ["RS256"], clockTolerance: 60 });
  if (payload.nonce !== nonce) throw new Error("Sign-in nonce mismatch");
  if (payload.tid !== c.tenant) throw new Error("Token is from a different tenant");
  const oid = String(payload.oid ?? "");
  const email = String(payload.email ?? payload.preferred_username ?? "").toLowerCase();
  if (!oid || !email) throw new Error("Token has no account identifier");
  return { oid, email, name: String(payload.name ?? email) };
}

export type Resolved = { ok: true; user: User } | { ok: false; error: string };

/**
 * Maps a verified Microsoft identity to a user an admin created beforehand. Nobody is created automatically.
 * First sign-in binds the Microsoft account id (oid) to the user; later sign-ins match on oid.
 */
export async function resolveUser(claims: Claims): Promise<Resolved> {
  const cols = "id,email,name,role,person_id,active,auth_method,ms_oid";
  let u = await get<any>(`SELECT ${cols} FROM users WHERE ms_oid=?`, claims.oid);
  if (!u) {
    u = await get<any>(`SELECT ${cols} FROM users WHERE lower(email)=?`, claims.email);
    if (u?.ms_oid && u.ms_oid !== claims.oid) return { ok: false, error: "This user is already linked to a different Microsoft account." };
  }
  if (!u) return { ok: false, error: `No access for ${claims.email}. Ask an admin to add you first.` };
  if (!u.active) return { ok: false, error: "This account is deactivated." };
  if (u.auth_method === "password") return { ok: false, error: "This account signs in with a password, not Microsoft." };
  if (!u.ms_oid) await run("UPDATE users SET ms_oid=? WHERE id=?", claims.oid, u.id);
  return { ok: true, user: { id: u.id, email: u.email, name: u.name, role: u.role, person_id: u.person_id } };
}
