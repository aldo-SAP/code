import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import DataTable, { type Row } from "@/components/DataTable";
import PageHead from "@/components/PageHead";

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; user?: string; action?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const where: string[] = [], args: string[] = [];
  if (sp.entity) { where.push("entity=?"); args.push(sp.entity); }
  if (sp.user) { where.push("user_name=?"); args.push(sp.user); }
  if (sp.action) { where.push("action=?"); args.push(sp.action); }
  if (sp.q) { where.push("(summary ILIKE ? OR reason ILIKE ? OR details ILIKE ?)"); args.push(`%${sp.q}%`, `%${sp.q}%`, `%${sp.q}%`); }
  const rows = await all<any>(`SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 1000`, ...args);
  const risky = new Set(["reopen_billed_hours", "void", "discard_draft", "login_failed", "delete"]);
  const tableRows: Row[] = rows.map((r) => ({ id: r.id, when: { t: fmtDateTime(r.created_at), s: r.created_at }, who: r.user_name, from: [r.country, r.ip].filter(Boolean).join(" "), action: { t: r.action, bad: risky.has(r.action) }, what: { t: r.summary, detail: r.details ? JSON.stringify(JSON.parse(r.details), null, 2) : undefined }, reason: r.reason }));
  return (
    <>
      <PageHead title="Audit log" sub="Append-only: entries cannot be edited or deleted, not even by admins. Times are UTC. Showing the latest 1000 entries. Use the filters and search under the headings." />
      <DataTable rows={tableRows} empty="Nothing logged yet." pageSize={25} initialSort={[{ id: "when", desc: true }]}
        cols={[{ key: "when", label: "When (UTC)", filter: "none" }, { key: "who", label: "Who", filter: "select" }, { key: "from", label: "From", phoneHidden: true }, { key: "action", label: "Action", filter: "select" }, { key: "what", label: "What happened" }, { key: "reason", label: "Reason", phoneHidden: true }]} />
    </>
  );
}
