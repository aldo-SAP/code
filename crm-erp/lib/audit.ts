import { all, get, run } from "./db.ts";

export interface Actor { id: number | null; name: string }

/** IP and country of the current request (Cloudflare headers first). Empty outside a web request. */
export async function requestInfo(): Promise<{ ip: string | null; country: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const country = h.get("cf-ipcountry") ?? null;
    return { ip, country: country && country !== "XX" ? country : null };
  } catch {
    return { ip: null, country: null };
  }
}

/** Append one line to the audit log. `details` is stored as JSON (before/after values, affected ids). */
export async function audit(actor: Actor, action: string, entity: string, entityId: number | null, summary: string, opts: { details?: unknown; reason?: string } = {}) {
  const { ip, country } = await requestInfo();
  await run("INSERT INTO audit_log (user_id,user_name,action,entity,entity_id,summary,details,reason,ip,country) VALUES (?,?,?,?,?,?,?,?,?,?)",
    actor.id, actor.name, action, entity, entityId, summary, opts.details === undefined ? null : JSON.stringify(opts.details), opts.reason ?? null, ip, country);
}

export async function auditFor(entity: string, entityId: number) {
  return all<any>("SELECT * FROM audit_log WHERE entity=? AND entity_id=? ORDER BY id DESC", entity, entityId);
}

/** Logs a successful sign-in, and flags it when the user signs in from a country they have never used before. */
export async function noteLogin(actor: { id: number; name: string }, method: string) {
  const { country } = await requestInfo();
  const seenBefore = country ? await get("SELECT 1 FROM audit_log WHERE user_id=? AND action='login' AND country=? LIMIT 1", actor.id, country) : undefined;
  const anyBefore = await get("SELECT 1 FROM audit_log WHERE user_id=? AND action='login' LIMIT 1", actor.id);
  await audit(actor, "login", "user", actor.id, `Signed in with ${method}`);
  if (country && anyBefore && !seenBefore) await audit(actor, "login_new_country", "user", actor.id, `Sign-in from a new country: ${country}`);
}
