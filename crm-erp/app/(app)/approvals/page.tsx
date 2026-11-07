import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { reopenEntries, reviewEntries } from "@/app/actions";
import { Flash, Hidden, num } from "@/components/ui";
import PageHead from "@/components/PageHead";
import { dayLines, expectedHours } from "@/lib/expected";
import DataTable, { type CellForm, type Col, type Row } from "@/components/DataTable";

async function groups(status: string, extra = "") {
  const rows = await all<any>(`SELECT t.id,t.work_date,t.hours,t.worker_id,t.assignment_id,w.name AS worker,pr.name AS project,o.name AS owner,a.person_id AS owner_id,a.hours_per_day
    FROM timesheet_entries t JOIN people w ON w.id=t.worker_id JOIN assignments a ON a.id=t.assignment_id JOIN projects pr ON pr.id=a.project_id JOIN people o ON o.id=a.person_id
    WHERE t.status=? ${extra} ORDER BY w.name, pr.name, t.work_date`, status);
  const map = new Map<string, any>();
  for (const r of rows) {
    const k = `${r.worker_id}|${r.assignment_id}|${r.work_date.slice(0, 7)}`;
    const g = map.get(k) ?? { ...r, month: r.work_date.slice(0, 7), ids: [] as number[], hours: 0, days: [] as { date: string; hours: number }[] };
    g.ids.push(r.id); g.hours += r.hours; g.days.push({ date: r.work_date, hours: r.hours });
    map.set(k, g);
  }
  return [...map.values()];
}

export default async function Approvals({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const submitted = await groups("submitted");
  const approved = await groups("approved", "AND t.invoice_id IS NULL AND t.payout_id IS NULL");
  const expectedCache = new Map<string, number>();
  const expectedFor = async (g: any) => { const k = `${g.worker_id}|${g.month}`; if (!expectedCache.has(k)) expectedCache.set(k, (await expectedHours(g.worker_id, g.month)).hours); return expectedCache.get(k)!; };
  const toRow = async (g: any, forms: CellForm[]): Promise<Row> => {
    const exp = await expectedFor(g);
    return {
      id: `${g.worker_id}${g.assignment_id}${g.month}`,
      person: { t: g.worker, href: `/timesheets?person=${g.worker_id}&month=${g.month}`, sub: g.owner_id !== g.worker_id ? `covering for ${g.owner}` : undefined },
      project: g.project, month: g.month,
      logged: { t: `${num(g.hours)} h`, s: g.hours, sub: `${num(g.hours / g.hours_per_day)} days` },
      expected: { t: `${num(exp)} h`, s: exp },
      days: { t: "", lines: dayLines(g.days) }, actions: { t: "", forms },
    };
  };
  const cols: Col[] = [{ key: "person", label: "Person" }, { key: "project", label: "Project", filter: "select" }, { key: "month", label: "Month", filter: "select" }, { key: "logged", label: "Entered", num: true, filter: "none" }, { key: "expected", label: "Expected", num: true, filter: "none" }, { key: "days", label: "Days", filter: "none", sort: false }, { key: "actions", label: "", filter: "none", sort: false }];
  const waiting = await Promise.all(submitted.map((g) => toRow(g, [{ action: reviewEntries, hidden: { ids: g.ids.join(",") }, buttons: [{ label: "Approve", name: "decision", value: "approve" }, { label: "Reject", name: "decision", value: "reject", variant: "danger" }] }])));
  const ready = await Promise.all(approved.map((g) => toRow(g, [{ action: reopenEntries, hidden: { ids: g.ids.join(",") }, buttons: [{ label: "Reopen", variant: "sec" }] }])));
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
