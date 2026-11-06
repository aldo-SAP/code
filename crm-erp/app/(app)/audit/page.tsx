import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Field } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; user?: string; action?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const where: string[] = [], args: string[] = [];
  if (sp.entity) { where.push("entity=?"); args.push(sp.entity); }
  if (sp.user) { where.push("user_name=?"); args.push(sp.user); }
  if (sp.action) { where.push("action=?"); args.push(sp.action); }
  if (sp.q) { where.push("(summary ILIKE ? OR reason ILIKE ? OR details ILIKE ?)"); args.push(`%${sp.q}%`, `%${sp.q}%`, `%${sp.q}%`); }
  const rows = await all<any>(`SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 300`, ...args);
  const entities = await all<any>("SELECT DISTINCT entity FROM audit_log ORDER BY 1");
  const users = await all<any>("SELECT DISTINCT user_name FROM audit_log ORDER BY 1");
  const actions = await all<any>("SELECT DISTINCT action FROM audit_log ORDER BY 1");
  const risky = new Set(["reopen_billed_hours", "void", "discard_draft", "login_failed", "delete"]);
  return (
    <>
      <h2>Audit log</h2>
      <p className="muted">Append-only: entries cannot be edited or deleted, not even by admins. Times are UTC. Showing the latest 300 matches.</p>
      <form className="row card">
        <Field label="Search"><input name="q" defaultValue={sp.q ?? ""} /></Field>
        <Field label="Who"><select name="user" defaultValue={sp.user ?? ""}><option value="">Anyone</option>{users.map((u) => <option key={u.user_name}>{u.user_name}</option>)}</select></Field>
        <Field label="What"><select name="entity" defaultValue={sp.entity ?? ""}><option value="">Everything</option>{entities.map((e) => <option key={e.entity}>{e.entity}</option>)}</select></Field>
        <Field label="Action"><select name="action" defaultValue={sp.action ?? ""}><option value="">Any</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select></Field>
        <button className="sec">Filter</button>
      </form>
      <div className="tw"><table><thead><tr><th>When (UTC)</th><th>Who</th><th>From</th><th>Action</th><th>What happened</th><th>Reason</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.created_at)}</td><td>{r.user_name}</td><td className="muted">{[r.country, r.ip].filter(Boolean).join(" ")}</td>
          <td><span className={`badge ${risky.has(r.action) ? "err" : ""}`}>{r.action}</span></td>
          <td>{r.summary}{r.details && <details><summary className="muted" style={{ cursor: "pointer" }}>details</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 4 }}>{JSON.stringify(JSON.parse(r.details), null, 2)}</pre></details>}</td>
          <td>{r.reason}</td></tr>)}
        {!rows.length && <tr><td colSpan={6} className="muted">Nothing logged yet.</td></tr>}</tbody></table></div>
    </>
  );
}
