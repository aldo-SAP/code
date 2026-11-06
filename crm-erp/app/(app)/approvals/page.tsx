import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { reopenEntries, reviewEntries } from "@/app/actions";
import { Flash, Hidden, num } from "@/components/ui";
import PageHead from "@/components/PageHead";
import DataTable, { type CellForm, type Col, type Row } from "@/components/DataTable";

async function groups(status: string, extra = "") {
  const rows = await all<any>(`SELECT t.id,t.work_date,t.hours,t.worker_id,t.assignment_id,w.name AS worker,pr.name AS project,o.name AS owner,a.person_id AS owner_id,a.hours_per_day
    FROM timesheet_entries t JOIN people w ON w.id=t.worker_id JOIN assignments a ON a.id=t.assignment_id JOIN projects pr ON pr.id=a.project_id JOIN people o ON o.id=a.person_id
    WHERE t.status=? ${extra} ORDER BY w.name, pr.name, t.work_date`, status);
  const map = new Map<string, any>();
  for (const r of rows) {
    const k = `${r.worker_id}|${r.assignment_id}|${r.work_date.slice(0, 7)}`;
    const g = map.get(k) ?? { ...r, month: r.work_date.slice(0, 7), ids: [] as number[], hours: 0, days: [] as string[] };
    g.ids.push(r.id); g.hours += r.hours; g.days.push(`${Number(r.work_date.slice(8))}: ${r.hours}`);
    map.set(k, g);
  }
  return [...map.values()];
}

export default async function Approvals({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const submitted = await groups("submitted");
  const approved = await groups("approved", "AND t.invoice_id IS NULL AND t.payout_id IS NULL");
  const toRow = (g: any, forms: CellForm[]): Row => ({
    id: `${g.worker_id}${g.assignment_id}${g.month}`,
    person: { t: g.worker, href: `/timesheets?person=${g.worker_id}&month=${g.month}`, sub: g.owner_id !== g.worker_id ? `covering for ${g.owner}` : undefined },
    project: g.project, month: g.month, total: { t: `${num(g.hours)}h / ${num(g.hours / g.hours_per_day)}d`, s: g.hours },
    days: { t: g.days.join(", "), muted: true }, actions: { t: "", forms },
  });
  const cols: Col[] = [{ key: "person", label: "Person" }, { key: "project", label: "Project", filter: "select" }, { key: "month", label: "Month", filter: "select" }, { key: "total", label: "Total", num: true, filter: "none" }, { key: "days", label: "Days: hours", filter: "none", sort: false, phoneHidden: false }, { key: "actions", label: "", filter: "none", sort: false }];
  const waiting = submitted.map((g) => toRow(g, [{ action: reviewEntries, hidden: { ids: g.ids.join(",") }, buttons: [{ label: "Approve", name: "decision", value: "approve" }, { label: "Reject", name: "decision", value: "reject", variant: "danger" }] }]));
  const ready = approved.map((g) => toRow(g, [{ action: reopenEntries, hidden: { ids: g.ids.join(",") }, buttons: [{ label: "Reopen", variant: "sec" }] }]));
  return (
    <>
      <PageHead title="Approvals" sub="Hours waiting for your decision, and approved hours not yet invoiced." /><Flash sp={sp} />
      <h2>Waiting for approval</h2>
      <DataTable rows={waiting} cols={cols} empty="Nothing waiting." />
      <p className="muted">Hours already on an invoice or payout are locked. To correct them use <Link href="/unlock">Unlock billed hours</Link> (needs a reason, everything is logged).</p>
      <h2>Approved, not yet invoiced</h2>
      <DataTable rows={ready} cols={cols} empty="None." />
    </>
  );
}
