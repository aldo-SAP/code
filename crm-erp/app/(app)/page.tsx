import Link from "next/link";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { marginReport } from "@/lib/invoicing";
import { money, thisMonth } from "@/components/ui";

export default async function Dashboard() {
  const user = await requireUser();
  if (user.role === "worker") redirect("/timesheets");
  const c = (sql: string) => get<{ n: number }>(sql)!.n;
  const stages = all<{ stage: string; n: number }>("SELECT stage, COUNT(*) n FROM people GROUP BY stage");
  const pipeline = all<{ stage: string; n: number; v: number }>("SELECT stage, COUNT(*) n, SUM(value) v FROM deals WHERE stage NOT IN ('won','lost') GROUP BY stage");
  const period = thisMonth();
  const m = can.finance(user) ? marginReport(period) : null;
  const stat = (label: string, value: string | number, href?: string) => (
    <div className="stat">{href ? <Link href={href}><b>{value}</b></Link> : <b>{value}</b>}<span>{label}</span></div>
  );
  return (
    <>
      <h2>Dashboard</h2>
      <div className="grid">
        {stat("Active clients", c("SELECT COUNT(*) n FROM clients WHERE status='active'"), "/clients")}
        {stat("Active projects", c("SELECT COUNT(*) n FROM projects WHERE status='active'"), "/projects")}
        {stat("Open deals", pipeline.reduce((s, p) => s + p.n, 0), "/deals")}
        {stat("Timesheets awaiting approval", c("SELECT COUNT(DISTINCT worker_id||'-'||substr(work_date,1,7)) n FROM timesheet_entries WHERE status='submitted'"), "/approvals")}
        {stat("Draft invoices", c("SELECT COUNT(*) n FROM invoices WHERE status='draft'"), "/invoices")}
        {stat("Unpaid invoices", c("SELECT COUNT(*) n FROM invoices WHERE status='issued'"), "/invoices")}
        {m && stat(`Margin ${period}`, money(m.revenue - m.cost), "/reports")}
      </div>
      <h3>Talent by stage</h3>
      <div className="grid">{["applicant", "training", "ready", "placed", "alumni"].map((s) => stat(s, stages.find((x) => x.stage === s)?.n ?? 0, `/people?stage=${s}`))}</div>
      <h3>Pipeline value (open)</h3>
      <div className="grid">{pipeline.map((p) => stat(`${p.stage} (${p.n})`, money(p.v)))}{!pipeline.length && <span className="muted">No open deals yet.</span>}</div>
    </>
  );
}
