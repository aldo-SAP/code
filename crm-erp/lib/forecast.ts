import { all } from "./db.ts";

export interface ForecastMonth { period: string; workDays: number; assigned: number; away: number; free: number }
export interface ForecastPerson { id: number; name: string; type: string; skills: string; months: ForecastMonth[]; freeFrom: string | null; ending: { project: string; end: string }[] }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

/** For the next `count` months: how many of each person's working days are on a project, away (leave or own public holiday) or free. */
export async function forecast(from: string, count = 6): Promise<{ months: string[]; people: ForecastPerson[] }> {
  const months = Array.from({ length: count }, (_, i) => addMonths(from, i));
  const start = `${months[0]}-01`, end = iso(new Date(Date.UTC(+addMonths(from, count).slice(0, 4), +addMonths(from, count).slice(5) - 1, 0)));
  const people = await all<any>("SELECT id,name,worker_type,skills,holiday_country FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const asg = await all<any>(`SELECT a.person_id, a.start_date, a.end_date, pr.name AS project FROM assignments a JOIN projects pr ON pr.id=a.project_id
    WHERE a.start_date<=? AND (a.end_date IS NULL OR a.end_date>=?) AND pr.status<>'done'`, end, start);
  const leave = await all<any>("SELECT person_id,from_date,to_date FROM leave WHERE status='approved' AND from_date<=? AND to_date>=?", end, start);
  const hol = await all<any>("SELECT country,day FROM holidays WHERE day BETWEEN ? AND ?", start, end);
  const holSet = new Set(hol.map((h) => `${h.country}|${h.day}`));
  const out: ForecastPerson[] = people.map((p) => {
    const mine = asg.filter((a) => a.person_id === p.id);
    const ms: ForecastMonth[] = months.map((period) => {
      const n = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5), 0)).getUTCDate();
      let workDays = 0, assigned = 0, away = 0;
      for (let d = 1; d <= n; d++) {
        const day = `${period}-${String(d).padStart(2, "0")}`, w = new Date(day + "T00:00:00Z").getUTCDay();
        if (w === 0 || w === 6) continue;
        workDays++;
        if (holSet.has(`${p.holiday_country}|${day}`) || leave.some((l) => l.person_id === p.id && l.from_date <= day && day <= l.to_date)) { away++; continue; }
        if (mine.some((a) => a.start_date <= day && (!a.end_date || day <= a.end_date))) assigned++;
      }
      return { period, workDays, assigned, away, free: workDays - assigned - away };
    });
    const open = mine.some((a) => !a.end_date);
    const last = mine.filter((a) => a.end_date).map((a) => a.end_date as string).sort().pop() ?? null;
    return { id: p.id, name: p.name, type: p.worker_type, skills: p.skills ?? "", months: ms,
      freeFrom: !mine.length ? start : open ? null : last && last < end ? iso(new Date(new Date(last + "T00:00:00Z").getTime() + 86400000)) : null,
      ending: mine.filter((a) => a.end_date && a.end_date <= end).map((a) => ({ project: a.project, end: a.end_date })) };
  });
  return { months, people: out };
}
