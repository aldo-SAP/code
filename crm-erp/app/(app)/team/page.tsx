import Link from "next/link";
import { requireManager } from "@/lib/session";
import { teamMonth, type Cell } from "@/lib/team";
import { fmtDate, fmtMonth, fmtMonthShort, fmtRange } from "@/lib/dates";
import { Field, Flash, thisMonth } from "@/components/ui";

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const shift = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); };
const mark = (c: Cell) => ({ off: c.label === "sick" ? "S" : c.label === "holiday" ? "H" : c.label === "other" ? "O" : "V", pending: "?", holiday: "H", cover: "C", work: "", free: "", weekend: "" }[c.state]);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default async function Team({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; month?: string; project?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const projectId = sp.project ? Number(sp.project) : undefined;
  const t = await teamMonth(period, { projectId });
  const q = (m: string) => `/team?month=${m}${projectId ? `&project=${projectId}` : ""}`;
  const needing = t.gaps.filter((g) => g.status === "approved").length, waiting = t.gaps.length - needing;
  return (
    <>
      <h1>Team calendar</h1><Flash sp={sp} />
      <p className="muted">Who is working, away or free each day, and who could cover an absence. Public holidays follow each person's own country.</p>

      <form className="row card">
        <Field label="Month"><input type="month" name="month" defaultValue={period} /></Field>
        <Field label="Project"><select name="project" defaultValue={projectId ?? ""}><option value="">Everyone</option>{t.projects.map((p) => <option key={p.id} value={p.id}>{p.client}: {p.name}</option>)}</select></Field>
        <button className="sec">Show</button>
        <div className="wide"><Link className="btn sec" href={q(shift(period, -1))}>&larr; {fmtMonthShort(shift(period, -1))}</Link> <Link className="btn sec" href={q(shift(period, 1))}>{fmtMonthShort(shift(period, 1))} &rarr;</Link></div>
      </form>

      <h2>Needs cover {t.gaps.length ? `(${t.gaps.length})` : ""}</h2>
      {!t.gaps.length ? <div className="card muted">Nobody is absent on a project without a substitute in {fmtMonth(period)}.</div> : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{needing ? `${plural(needing, "approved absence")}` : ""}{needing && waiting ? " and " : ""}{waiting ? `${plural(waiting, "request")} still waiting for a decision` : ""} with working days that nobody covers.</p>
          {t.gaps.map((g) => (
            <div className="card gap" key={`${g.leaveId}-${g.assignmentId}`} style={{ marginBottom: 12 }}>
              <div><b>{g.person}</b> is off <b>{g.ranges.map((r) => fmtRange(r.from, r.to)).join(", ")}</b> <span className={`badge ${g.status === "approved" ? "ok" : "warn"}`}>{g.status === "approved" ? g.type : `${g.type}, waiting`}</span></div>
              <div className="muted">{g.project} for {g.client} ({g.billing}) · {plural(g.uncovered.length, "working day")} without cover · <Link href={`/leave/${g.leaveId}`}>see the request</Link></div>
              {g.billing === "monthly" || g.billing === "fixed" ? <div className="muted">This is a {g.billing === "monthly" ? "monthly fee" : "fixed-price"} assignment: billing continues either way, cover is about delivery.</div> : null}
              <h3 className="small">Who could cover</h3>
              {g.candidates.length ? (
                <ul className="cands">
                  {g.candidates.map((c) => (
                    <li key={c.id}>
                      <div><b>{c.name}</b> <span className="muted">({c.type})</span> {c.freeDays === c.totalDays ? <span className="badge ok">free all {c.totalDays} days</span> : <span className="badge warn">free {c.freeDays} of {c.totalDays} days</span>}</div>
                      <div className="muted">{c.note}{c.sharedSkills.length ? ` · shared skills: ${c.sharedSkills.join(", ")}` : c.skills ? ` · skills: ${c.skills}` : ""}</div>
                      <Link className="btn sec sm" href={`/assignments/${g.assignmentId}?sub_from=${g.uncovered[0]}&sub_to=${g.uncovered[g.uncovered.length - 1]}&sub_person=${c.id}&sub_reason=${encodeURIComponent("Cover for " + g.person)}#substitution`}>Arrange cover with {c.name}</Link>
                    </li>))}
                </ul>
              ) : <p>Nobody else is free on those days. You could move the work, ask the client, or hire for the gap.</p>}
            </div>))}
        </>
      )}

      <h2>{fmtMonth(period)}</h2>
      <div className="legend" aria-label="Legend">
        <span style={{ ["--c" as string]: "var(--brand)" }}>Working</span><span style={{ ["--c" as string]: "var(--warn)" }}>V vacation / O other</span><span style={{ ["--c" as string]: "var(--err)" }}>S sick</span>
        <span style={{ ["--c" as string]: "var(--muted)" }}>? waiting for approval</span><span style={{ ["--c" as string]: "var(--muted)" }}>H public holiday</span><span style={{ ["--c" as string]: "var(--ok)" }}>C covering for someone</span><span style={{ ["--c" as string]: "var(--line)" }}>blank = free (no project)</span>
      </div>
      <div className="tw"><table className="cal team nostack">
        <thead>
          <tr><th scope="col">Person</th>{t.days.map((d) => <th scope="col" key={d} className={[0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay()) ? "we" : ""}>{Number(d.slice(8))}<br /><span>{WD[new Date(d + "T00:00:00Z").getUTCDay()]}</span></th>)}</tr>
          <tr className="sum"><th scope="row">People off</th>{t.days.map((d) => { const o = t.offPerDay[d]; return <td key={d} title={`${fmtDate(d)}: ${o.off} off${o.pending ? `, ${o.pending} waiting` : ""}`} className={o.off ? (o.off >= 3 ? "hot" : "warm") : ""}>{o.off || o.pending ? `${o.off}${o.pending ? "+" + o.pending : ""}` : ""}</td>; })}</tr>
        </thead>
        <tbody>
          {t.people.map((p) => (
            <tr key={p.id}>
              <th scope="row"><Link href={`/people/${p.id}`}>{p.name}</Link><div className="muted">{p.projects.join(", ") || "no project"}{p.offDays ? ` · ${p.offDays} off` : ""}</div></th>
              {t.days.map((d) => { const c = p.cells[d]; return <td key={d} className={`c-${c.state}${c.label === "sick" ? " sick" : ""}`} title={`${p.name}, ${fmtDate(d)}: ${c.state === "work" ? "working on " + c.label : c.state === "free" ? "free (no project)" : c.state === "weekend" ? "weekend" : c.label ?? c.state}`}>{mark(c)}</td>; })}
            </tr>))}
          {!t.people.length && <tr><td colSpan={t.days.length + 1} className="muted">Nobody to show.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
