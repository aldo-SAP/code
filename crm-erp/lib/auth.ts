import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { get } from "./db.ts";

export type Role = "admin" | "manager" | "worker";
export interface User { id: number; email: string; name: string; role: Role; person_id: number | null }

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

function secret(): string {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const f = "data/secret";
  if (!existsSync(f)) {
    mkdirSync("data", { recursive: true });
    writeFileSync(f, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(f, "utf8");
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

/** Short-lived signed blob (used to carry the Microsoft login state through the redirect). */
export function signBlob(data: object, ttlMs = 10 * 60_000): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function readBlob<T = any>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const d = JSON.parse(Buffer.from(body, "base64url").toString()); return d.exp > Date.now() ? d : null; } catch { return null; }
}

export const SESSION_COOKIE = "session";
/** Shorter sessions for more powerful roles: admins 8 hours, managers 12 hours, workers 7 days. */
export const sessionHours = (role: string) => (role === "admin" ? 8 : role === "manager" ? 12 : 24 * 7);

export function makeSession(userId: number, role: string): string {
  const exp = Date.now() + sessionHours(role) * 3600_000;
  const v = `${userId}.${exp}`;
  return `${v}.${sign(v)}`;
}
export async function userFromSession(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  return await get<User>("SELECT id,email,name,role,person_id FROM users WHERE id=? AND active=1", Number(id)) ?? null;
}

/** What each role may do. Finance = cost rates, payouts, margins. */
export const can = {
  finance: (u: User) => u.role === "admin",
  manage: (u: User) => u.role === "admin" || u.role === "manager",
  admin: (u: User) => u.role === "admin",
};
