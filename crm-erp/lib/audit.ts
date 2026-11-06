import { all, run } from "./db.ts";

export interface Actor { id: number | null; name: string }

/** Append one line to the audit log. `details` is stored as JSON (before/after values, affected ids). */
export function audit(actor: Actor, action: string, entity: string, entityId: number | null, summary: string, opts: { details?: unknown; reason?: string } = {}) {
  run("INSERT INTO audit_log (user_id,user_name,action,entity,entity_id,summary,details,reason) VALUES (?,?,?,?,?,?,?,?)",
    actor.id, actor.name, action, entity, entityId, summary, opts.details === undefined ? null : JSON.stringify(opts.details), opts.reason ?? null);
}

export function auditFor(entity: string, entityId: number) {
  return all<any>("SELECT * FROM audit_log WHERE entity=? AND entity_id=? ORDER BY id DESC", entity, entityId);
}
