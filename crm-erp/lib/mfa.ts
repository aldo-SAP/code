import { get, run, tx } from "./db.ts";
import { audit, type Actor } from "./audit.ts";
import { decryptSecret, encryptSecret, keyedHash } from "./auth.ts";
import { generateRecoveryCodes, generateSecret, normalizeRecovery, stepAt, verifyTotp } from "./totp.ts";

export type MfaPolicy = "off" | "privileged" | "all";

/** Company policy for PASSWORD sign-ins (Microsoft sign-in has its own MFA). */
export async function mfaPolicy(): Promise<MfaPolicy> {
  const v = (await get<{ value: string }>("SELECT value FROM settings WHERE key='mfa_policy'"))?.value ?? process.env.MFA_POLICY ?? "off";
  return v === "privileged" || v === "all" ? v : "off";
}
/** Must this user enrol an authenticator before they can sign in with a password? */
export async function mfaRequiredFor(role: string): Promise<boolean> {
  const p = await mfaPolicy();
  return p === "all" || (p === "privileged" && (role === "admin" || role === "manager"));
}

export async function mfaStatus(userId: number) {
  const u = await get<{ totp_enabled: number }>("SELECT totp_enabled FROM users WHERE id=?", userId);
  const left = (await get<{ n: number }>("SELECT COUNT(*) n FROM recovery_codes WHERE user_id=? AND used_at IS NULL", userId))?.n ?? 0;
  return { enabled: !!u?.totp_enabled, recoveryLeft: left };
}

/** Starts (or resumes) enrolment: a fresh secret is stored encrypted as "pending" until the first code is confirmed. */
export async function beginEnrollment(userId: number): Promise<string> {
  const u = await get<{ totp_pending: string | null }>("SELECT totp_pending FROM users WHERE id=?", userId);
  if (u?.totp_pending) return decryptSecret(u.totp_pending);
  const secret = generateSecret();
  await run("UPDATE users SET totp_pending=? WHERE id=?", encryptSecret(secret), userId);
  return secret;
}

async function newRecoveryCodes(userId: number): Promise<string[]> {
  await run("DELETE FROM recovery_codes WHERE user_id=?", userId);
  const codes = generateRecoveryCodes();
  for (const c of codes) await run("INSERT INTO recovery_codes (user_id,code_hash) VALUES (?,?)", userId, keyedHash(normalizeRecovery(c)));
  return codes;
}

/** Turns the pending secret on once the user proves their app works. Returns the recovery codes (shown once). */
export async function confirmEnrollment(actor: Actor & { id: number }, code: string): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const u = await get<{ totp_pending: string | null }>("SELECT totp_pending FROM users WHERE id=?", actor.id);
  if (!u?.totp_pending) return { ok: false, error: "Start again: there is no pending setup." };
  const step = verifyTotp(decryptSecret(u.totp_pending), code);
  if (step === null) return { ok: false, error: "That code is not right. Check the time on your phone and try the next code." };
  const codes = await tx(async () => {
    await run("UPDATE users SET totp_secret=totp_pending, totp_pending=NULL, totp_enabled=1, totp_last_step=? WHERE id=?", step, actor.id);
    const c = await newRecoveryCodes(actor.id);
    await audit(actor, "mfa_enabled", "user", actor.id, "Authenticator app turned on");
    return c;
  });
  return { ok: true, codes };
}

export type MfaCheck = { ok: true; method: "totp" | "recovery"; recoveryLeft?: number } | { ok: false };

/**
 * Second step of a password sign-in: an authenticator code or a recovery code.
 * Authenticator codes work once (the step is remembered); recovery codes work once each.
 */
export async function verifyMfa(userId: number, input: string): Promise<MfaCheck> {
  const u = await get<{ totp_secret: string | null; totp_last_step: number; totp_enabled: number }>("SELECT totp_secret,totp_last_step,totp_enabled FROM users WHERE id=?", userId);
  if (!u?.totp_enabled || !u.totp_secret) return { ok: false };
  const step = verifyTotp(decryptSecret(u.totp_secret), input, Date.now(), Number(u.totp_last_step));
  if (step !== null) {
    // only the first request to use this step wins, even if two arrive together
    const r = await get<{ id: number }>("UPDATE users SET totp_last_step=? WHERE id=? AND totp_last_step<? RETURNING id", step, userId, step);
    return r ? { ok: true, method: "totp" } : { ok: false };
  }
  const norm = normalizeRecovery(input);
  if (norm.length === 10) {
    const hit = await get<{ id: number }>("UPDATE recovery_codes SET used_at=? WHERE id=(SELECT id FROM recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL LIMIT 1) RETURNING id",
      new Date().toISOString().slice(0, 19).replace("T", " "), userId, keyedHash(norm));
    if (hit) return { ok: true, method: "recovery", recoveryLeft: (await mfaStatus(userId)).recoveryLeft };
  }
  return { ok: false };
}

export async function disableMfa(actor: Actor & { id: number }, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await verifyMfa(actor.id, code);
  if (!r.ok) return { ok: false, error: "That code is not right." };
  await tx(async () => {
    await run("UPDATE users SET totp_secret=NULL, totp_pending=NULL, totp_enabled=0, totp_last_step=0 WHERE id=?", actor.id);
    await run("DELETE FROM recovery_codes WHERE user_id=?", actor.id);
    await audit(actor, "mfa_disabled", "user", actor.id, "Authenticator app turned off");
  });
  return { ok: true };
}

export async function regenerateRecovery(actor: Actor & { id: number }, code: string): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const r = await verifyMfa(actor.id, code);
  if (!r.ok) return { ok: false, error: "That code is not right." };
  const codes = await tx(async () => { const c = await newRecoveryCodes(actor.id); await audit(actor, "mfa_recovery_regenerated", "user", actor.id, "New recovery codes created"); return c; });
  return { ok: true, codes };
}

/** An admin resets someone's authenticator (lost phone). They must enrol again at their next password sign-in if the policy requires it. */
export async function adminResetMfa(actor: Actor, userId: number): Promise<void> {
  const u = await get<{ email: string }>("SELECT email FROM users WHERE id=?", userId);
  await tx(async () => {
    await run("UPDATE users SET totp_secret=NULL, totp_pending=NULL, totp_enabled=0, totp_last_step=0 WHERE id=?", userId);
    await run("DELETE FROM recovery_codes WHERE user_id=?", userId);
    await audit(actor, "mfa_reset", "user", userId, `Authenticator reset for ${u?.email ?? "user #" + userId}`);
  });
}

/** Failed sign-in attempts (password or code) for this email in the last 15 minutes. */
export async function recentFailures(email: string): Promise<number> {
  const since = new Date(Date.now() - 15 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  return (await get<{ n: number }>("SELECT COUNT(*) n FROM audit_log WHERE action='login_failed' AND user_name=? AND created_at > ?", email.toLowerCase(), since))?.n ?? 0;
}
export const stepNow = () => stepAt(Date.now());
