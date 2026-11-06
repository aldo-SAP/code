import Link from "next/link";
import { requireManager } from "@/lib/session";
import { forecast } from "@/lib/forecast";
import { fmtDate, fmtMonthShort } from "@/lib/dates";
import { thisMonth } from "@/components/ui";
import PageHead from "@/components/PageHead";

export default async function Forecast() {
  await requireManager();
  const f = await forecast(thisMonth(), 6);
  const sorted = [...f.people].sort((a, b) => b.months.reduce((x, m) => x + m.free, 0) - a.months.reduce((x, m) => x + m.free, 0) || a.name.localeCompare(b.name));
  return (
    <>
      <PageHead title="Availability forecast" />
      <p className="muted"><Link href="/team">&larr; Team calendar</Link> · Free working days per person for the next 6 months, after projects, approved leave and their own public holidays. Most available first.</p>
      <div className="tablewrap"><table><thead><tr><th>Person</th>{f.months.map((m) => <th key={m} className="num">{fmtMonthShort(m)}</th>)}<th>Free from</th><th>Assignments ending</th></tr></thead><tbody>
        {sorted.map((p) => <tr key={p.id}><td><span><b>{p.name}</b><br /><span className="muted">{p.type}{p.skills ? ` · ${p.skills}` : ""}</span></span></td>
          {p.months.map((m) => { const pct = m.workDays ? Math.round((m.assigned / m.workDays) * 100) : 0; return <td key={m.period} className="num" title={`${m.assigned} on projects, ${m.away} away, ${m.free} free of ${m.workDays} working days`}><span><b>{m.free}</b> <span className="muted">free · {pct}% busy</span></span></td>; })}
          <td>{p.freeFrom ? fmtDate(p.freeFrom) : "-"}</td><td>{p.ending.map((e) => `${e.project}: ${fmtDate(e.end)}`).join(", ") || "-"}</td></tr>)}
        {!sorted.length && <tr><td colSpan={9} className="muted">No people are ready or placed yet.</td></tr>}
      </tbody></table></div>
    </>
  );
}
