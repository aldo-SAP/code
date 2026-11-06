import { all } from "./db.ts";
import { periodRange } from "./billing.ts";

/** One person on one day, as the team calendar shows it. Earlier states win. */
export type CellState = "weekend" | "holiday" | "off" | "pending" | "cover" | "work" | "free";
export interface Cell { state: CellState; label?: string }

export interface TeamPerson {
  id: number; name: string; type: string; skills: string; holidayCountry: string | null;
  projects: string[]; cells: Record<string, Cell>; offDays: number;
}
export interface Candidate { id: number; name: string; type: string; skills: string; freeDays: number; totalDays: number; sharedSkills: string[]; onBench: boolean; note: string }
export interface Gap {
  leaveId: number; personId: number; person: string; type: string; status: string;
  assignmentId: number; project: string; client: string; billing: string;
  uncovered: string[];                                   // working days with nobody covering
  ranges: { from: string; to: string; days: number }[];
  candidates: Candidate[];
}
export interface TeamMonth {
  period: string; days: string[]; people: TeamPerson[]; offPerDay: Record<string, { off: number; pending: number }>;
  gaps: Gap[]; projects: { id: number; name: string; client: string }[];
}

const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
const isWeekday = (d: string) => { const w = dow(d); return w !== 0 && w !== 6; };
const addDay = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tokens = (s: string | null) => new Set((s ?? "").toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 1));

/** Consecutive working days become one range ("7-11 Dec"); weekends and holidays between them do not break it. */
function toRanges(days: string[]): Gap["ranges"] {
  const out: Gap["ranges"] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last) {
      let n = addDay(last.to, 1);
      while (n < d && (!isWeekday(n))) n = addDay(n, 1);    // skip weekends only; a gap in working days starts a new range
      if (n === d) { last.to = d; last.days++; continue; }
    }
    out.push({ from: d, to: d, days: 1 });
  }
  return out;
}

export async function teamMonth(period: string, opts: { projectId?: number } = {}): Promise<TeamMonth> {
  const { start, end } = periodRange(period);
  const n = Number(end.slice(8));
  const days = Array.from({ length: n }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`);

  const people = await all<any>("SELECT id,name,worker_type,skills,holiday_country FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const assignments = await all<any>(
    `SELECT a.id, a.person_id, a.billing_type, a.start_date, a.end_date, pr.id AS project_id, pr.name AS project, cl.name AS client
     FROM assignments a JOIN projects pr ON pr.id=a.project_id JOIN clients cl ON cl.id=pr.client_id
     WHERE a.start_date<=? AND (a.end_date IS NULL OR a.end_date>=?) AND pr.status<>'done'`, end, start);
  const leave = await all<any>("SELECT id,person_id,type,from_date,to_date,status FROM leave WHERE status IN ('approved','requested') AND from_date<=? AND to_date>=?", end, start);
  const subs = await all<any>(
    "SELECT s.id, s.assignment_id, s.person_id, s.from_date, s.to_date FROM substitutions s WHERE s.from_date<=? AND s.to_date>=?", end, start);
  const hol = await all<any>("SELECT country,day,name FROM holidays WHERE day BETWEEN ? AND ?", start, end);
  const holByCountry = new Map<string, Map<string, string>>();
  for (const h of hol) { if (!holByCountry.has(h.country)) holByCountry.set(h.country, new Map()); holByCountry.get(h.country)!.set(h.day, h.name); }
  const holidaysOf = (p: any) => holByCountry.get(p.holiday_country ?? "") ?? new Map<string, string>();

  const result: TeamPerson[] = people.map((p) => {
    const mine = assignments.filter((a) => a.person_id === p.id);
    const ph = holidaysOf(p);
    const cells: Record<string, Cell> = {};
    let offDays = 0;
    for (const d of days) {
      if (!isWeekday(d)) { cells[d] = { state: "weekend" }; continue; }
      if (ph.has(d)) { cells[d] = { state: "holiday", label: ph.get(d) }; continue; }
      const l = leave.find((x) => x.person_id === p.id && x.from_date <= d && d <= x.to_date);
      if (l) { cells[d] = l.status === "approved" ? { state: "off", label: l.type } : { state: "pending", label: `${l.type} (waiting)` }; if (l.status === "approved") offDays++; continue; }
      const cover = subs.find((s) => s.person_id === p.id && s.from_date <= d && d <= s.to_date);
      if (cover) { const a = assignments.find((x) => x.id === cover.assignment_id); cells[d] = { state: "cover", label: a ? `covering on ${a.project}` : "covering" }; continue; }
      const w = mine.find((a) => a.start_date <= d && (!a.end_date || d <= a.end_date));
      cells[d] = w ? { state: "work", label: w.project } : { state: "free" };
    }
    return { id: p.id, name: p.name, type: p.worker_type, skills: p.skills ?? "", holidayCountry: p.holiday_country, projects: [...new Set(mine.map((a) => a.project))], cells, offDays };
  });

  const offPerDay: TeamMonth["offPerDay"] = {};
  for (const d of days) offPerDay[d] = { off: result.filter((p) => p.cells[d].state === "off").length, pending: result.filter((p) => p.cells[d].state === "pending").length };

  // absences on assignments that need hours, with nobody covering
  const gaps: Gap[] = [];
  for (const l of leave) {
    const person = people.find((p) => p.id === l.person_id); if (!person) continue;
    const ph = holidaysOf(person);
    for (const a of assignments.filter((x) => x.person_id === l.person_id)) {
      const uncovered = days.filter((d) =>
        isWeekday(d) && !ph.has(d) && l.from_date <= d && d <= l.to_date && a.start_date <= d && (!a.end_date || d <= a.end_date) &&
        !subs.some((s) => s.assignment_id === a.id && s.from_date <= d && d <= s.to_date));
      if (!uncovered.length) continue;
      const mySkills = tokens(person.skills);
      const candidates: Candidate[] = people.filter((c) => c.id !== person.id).map((c) => {
        const cph = holidaysOf(c);
        let free = 0;
        for (const d of uncovered) {
          const busy = cph.has(d)
            || leave.some((x) => x.person_id === c.id && x.from_date <= d && d <= x.to_date)
            || subs.some((s) => s.person_id === c.id && s.from_date <= d && d <= s.to_date);
          if (!busy) free++;
        }
        const theirAssignments = assignments.filter((x) => x.person_id === c.id && uncovered.some((d) => x.start_date <= d && (!x.end_date || d <= x.end_date)));
        const shared = [...tokens(c.skills)].filter((t) => mySkills.has(t));
        return {
          id: c.id, name: c.name, type: c.worker_type, skills: c.skills ?? "", freeDays: free, totalDays: uncovered.length, sharedSkills: shared, onBench: theirAssignments.length === 0,
          note: theirAssignments.length ? `already on ${[...new Set(theirAssignments.map((x) => x.project))].join(", ")}` : "not assigned to a project then",
        };
      }).filter((c) => c.freeDays > 0)
        .sort((x, y) => (y.freeDays / y.totalDays) - (x.freeDays / x.totalDays) || y.sharedSkills.length - x.sharedSkills.length || Number(y.onBench) - Number(x.onBench) || x.name.localeCompare(y.name))
        .slice(0, 6);
      gaps.push({ leaveId: l.id, personId: person.id, person: person.name, type: l.type, status: l.status, assignmentId: a.id, project: a.project, client: a.client, billing: a.billing_type, uncovered, ranges: toRanges(uncovered), candidates });
    }
  }
  gaps.sort((a, b) => a.uncovered[0].localeCompare(b.uncovered[0]) || a.person.localeCompare(b.person));

  const projects = await all<any>("SELECT pr.id, pr.name, cl.name AS client FROM projects pr JOIN clients cl ON cl.id=pr.client_id WHERE pr.status<>'done' ORDER BY cl.name, pr.name");
  const keep = opts.projectId ? new Set(assignments.filter((a) => a.project_id === opts.projectId).map((a) => a.person_id)) : null;
  return {
    period, days, projects,
    people: keep ? result.filter((p) => keep.has(p.id)) : result,
    offPerDay, gaps: keep ? gaps.filter((g) => assignments.some((a) => a.id === g.assignmentId && a.project_id === opts.projectId)) : gaps,
  };
}
