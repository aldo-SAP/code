"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export interface Cell { v: string; status: string; disabled: boolean; billed: boolean; leave: boolean; holiday?: string; weekend: boolean }
export interface Row { id: number; project: string; substituting?: string; cells: Record<string, Cell>; total: number }

const subscribe = (cb: () => void) => { const mq = window.matchMedia("(max-width: 820px)"); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); };
const isPhone = () => window.matchMedia("(max-width: 820px)").matches;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
const num = (v: string) => { const n = Number(String(v).replace(",", ".")); return n > 0 && n <= 24 ? n : 0; };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/**
 * The hours inputs. On wide screens each assignment is a month calendar (Monday to Sunday, weekend columns greyed out);
 * on phones it is a day-by-day list with the day names. Weekends and public holidays are closed unless the customer asked
 * for that work (a tick box); approved leave shows 0. "Fill working days" puts 8 h on every open working day.
 */
export default function TimesheetFields({ days, rows, dayHours = 8 }: { days: string[]; rows: Row[]; dayHours?: number }) {
  const phone = useSyncExternalStore(subscribe, isPhone, () => false);
  const [nonworking, setNonworking] = useState(false);
  const initial = useMemo(() => Object.fromEntries(rows.flatMap((r) => days.map((d) => [`h_${r.id}_${d}`, r.cells[d].v]))), [rows, days]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [bump, setBump] = useState(0);
  type Range = "week" | "half" | "month";
  const weeks = useMemo(() => { const out: string[][] = []; for (const d of days) { if (!out.length || dow(d) === 1) out.push([]); out[out.length - 1].push(d); } return out; }, [days]);
  const [range, setRangeState] = useState<Range>("month");
  const [weekIdx, setWeekIdx] = useState(0);
  const [halfIdx, setHalfIdx] = useState(0);
  useEffect(() => { try { const r = localStorage.getItem("ts_range"); if (r === "week" || r === "half" || r === "month") setRangeState(r); } catch { /* keep default */ } }, []);
  useEffect(() => { const i = weeks.findIndex((w) => w.includes(new Date().toISOString().slice(0, 10))); if (i >= 0) setWeekIdx(i); }, [weeks]);   // this week, when the month is the current one
  const setRange = (r: Range) => { setRangeState(r); try { localStorage.setItem("ts_range", r); } catch { /* ignore */ } };
  const [sel, setSel] = useState<Set<number>>(new Set());          // projects ticked in the table view (checkboxes have no name, so they are never saved)
  const many = rows.length > 1;
  const [view, setViewState] = useState<"calendar" | "table">(many ? "table" : "calendar");   // several projects: overview first, one project: its calendar
  const [active, setActive] = useState<number>(rows[0]?.id ?? 0);
  useEffect(() => { try { const v = localStorage.getItem("ts_view"); if (v === "calendar" || v === "table") setViewState(v); } catch { /* private window: keep the default */ } }, []);
  const setView = (v: "calendar" | "table") => { setViewState(v); try { localStorage.setItem("ts_view", v); } catch { /* ignore */ } };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (bump) ref.current?.closest("form")?.dispatchEvent(new Event("input", { bubbles: true })); }, [bump]);   // lets the hours summary recount after a fill

  const closed = (c: Cell) => c.weekend || !!c.holiday;                       // not a normal working day
  const open = (c: Cell) => !c.disabled && (!c.leave || c.v !== "") && (!closed(c) || nonworking);   // leave days are closed, unless hours were already entered there (so they can be cleared)
  const set = (key: string, v: string) => setVals((s) => ({ ...s, [key]: v }));
  const fill = (r: Row) => { setVals((s) => { const n = { ...s }; for (const d of days) { const c = r.cells[d]; if (c.disabled) continue; if (c.leave) n[`h_${r.id}_${d}`] = ""; else if (!closed(c)) n[`h_${r.id}_${d}`] = String(dayHours); } return n; }); setBump((b) => b + 1); };
  const clear = (r: Row) => { setVals((s) => { const n = { ...s }; for (const d of days) { const c = r.cells[d]; if (!c.disabled) n[`h_${r.id}_${d}`] = ""; } return n; }); setBump((b) => b + 1); };
  const picked = rows.filter((r) => sel.has(r.id));
  const allOn = rows.length > 0 && picked.length === rows.length;
  const toggle = (id: number) => setSel((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = (f: (r: Row) => void) => picked.forEach(f);
  const cls = (c: Cell) => (c.billed ? "billed" : c.status || "");
  const hint = (c: Cell) => (c.billed ? "Billed: locked. Use Unlock billed hours to change." : c.holiday ?? (c.leave ? "Approved leave" : undefined));

  const toolbar = (r: Row) => (
    <div className="ts-tools">
      <b>{r.project}{r.substituting && <small> covering for {r.substituting}</small>}</b>
      <span className="ts-tools-btns">
        <button type="button" className="sec sm" onClick={() => fill(r)}>Fill working days ({dayHours} h)</button>
        <button type="button" className="sec sm" onClick={() => clear(r)}>Clear unsent days</button>
      </span>
    </div>
  );
  const input = (r: Row, d: string, c: Cell, extra = "") => {
    const key = `h_${r.id}_${d}`, isOpen = open(c);
    const v = c.leave && !vals[key] ? "0" : vals[key] ?? "";                    // approved leave shows 0
    return <input name={key} value={v} onChange={(e) => set(key, e.target.value)} disabled={!isOpen} readOnly={!isOpen} className={`${cls(c)} ${extra}`} title={hint(c)} inputMode="decimal" placeholder={closed(c) || c.leave ? "" : "h"} aria-label={`${r.project}, ${WD[dow(d)]} ${Number(d.slice(8))}${c.status ? ", " + c.status : ""}`} />;
  };
  const switchBox = (
    <label className="ts-nonwork"><input type="checkbox" checked={nonworking} onChange={(e) => setNonworking(e.target.checked)} /> The customer asked for work on a weekend or public holiday
      {nonworking && <input type="hidden" name="nonworking" value="1" />}</label>
  );

  const monthTotal = (r: Row) => days.reduce((t, d) => t + num(vals[`h_${r.id}_${d}`] ?? ""), 0);
  const switcher = (
    <div className="ts-switch" role="group" aria-label="Timesheet view">
      <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
      <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>All days in a row</button>
    </div>
  );

  const calendar = (r: Row) => {
    const first = (dow(days[0]) + 6) % 7;                                       // Monday = 0
    const slots: (string | null)[] = [...Array(first).fill(null), ...days]; while (slots.length % 7) slots.push(null);
    const weeks = Array.from({ length: slots.length / 7 }, (_, k) => slots.slice(k * 7, k * 7 + 7));
    return (
      <section key={r.id} className="card tscal-card" hidden={many && active !== r.id}>
        {toolbar(r)}
        <div className="tscal-grid" role="grid">
          {HEAD.map((h, i) => <div key={h} className={`tscal-h${i > 4 ? " we" : ""}`}>{h}</div>)}
          <div className="tscal-h tot">Week</div>
          {weeks.map((w, wi) => (
            <div className="tscal-week" key={wi}>
              {w.map((d, i) => {
                if (!d) return <div key={i} className="tscal-day blank" />;
                const c = r.cells[d], isOpen = open(c);
                return (
                  <label key={d} className={`tscal-day${i > 4 ? " we" : ""}${c.holiday ? " ph" : ""}${c.leave ? " lv" : ""}${!isOpen ? " off" : ""}`}>
                    <span className="tscal-n">{Number(d.slice(8))}{c.leave && <em>Leave</em>}{c.holiday && !c.leave && <em title={c.holiday}>Holiday</em>}</span>
                    {input(r, d, c)}
                  </label>
                );
              })}
              <div className="tscal-day tot"><b>{fmt(w.reduce((t, d) => t + (d ? num(vals[`h_${r.id}_${d}`] ?? "") : 0), 0))}</b><span>h</span></div>
            </div>
          ))}
        </div>
        <div className="ts-foot"><span>Month total for this project: <b>{fmt(monthTotal(r))} h</b></span></div>
      </section>
    );
  };

  // every day stays on the page (so Save sends everything); the range only hides columns
  const visible = new Set(range === "month" ? days : range === "week" ? weeks[Math.min(weekIdx, weeks.length - 1)] : days.filter((d) => (Number(d.slice(8)) <= 15) === (halfIdx === 0)));
  const vis = days.filter((d) => visible.has(d));
  const rangeLabel = range === "month" ? "Whole month" : `Days ${Number(vis[0].slice(8))}–${Number(vis[vis.length - 1].slice(8))}`;
  const rangeBar = (
    <div className="ts-range">
      <div className="ts-switch" role="group" aria-label="How many days to show">
        {(["week", "half", "month"] as Range[]).map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{r === "week" ? "Week" : r === "half" ? "Half month" : "Month"}</button>)}
      </div>
      {range === "week" && <span className="ts-pager"><button type="button" className="sec sm" disabled={weekIdx === 0} onClick={() => setWeekIdx(weekIdx - 1)} aria-label="Previous week">&larr;</button><b>{rangeLabel}</b><button type="button" className="sec sm" disabled={weekIdx >= weeks.length - 1} onClick={() => setWeekIdx(weekIdx + 1)} aria-label="Next week">&rarr;</button><span className="muted">Week {weekIdx + 1} of {weeks.length}</span></span>}
      {range === "half" && <span className="ts-pager"><button type="button" className="sec sm" aria-pressed={halfIdx === 0} onClick={() => setHalfIdx(0)}>Days 1–15</button><button type="button" className="sec sm" aria-pressed={halfIdx === 1} onClick={() => setHalfIdx(1)}>Days 16–{Number(days[days.length - 1].slice(8))}</button></span>}
    </div>
  );
  const table = (
    <section className="card tstab-card">
      <div className="ts-tools ts-bulk">
        <label className="ts-all"><input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = picked.length > 0 && !allOn; }} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /> Select all</label>
        <span className="muted">{picked.length ? `${picked.length} of ${rows.length} selected` : "Tick the projects you want to fill or clear"}</span>
        <span className="ts-tools-btns">
          <button type="button" className="sec sm" disabled={!picked.length} onClick={() => { picked.forEach((r) => fill(r)); }}>Fill working days ({dayHours} h)</button>
          <button type="button" className="sec sm" disabled={!picked.length} onClick={() => { picked.forEach((r) => clear(r)); }}>Clear unsent days</button>
        </span>
      </div>
      <div className="tw"><table className="ts nostack">
        <thead>
          <tr><th rowSpan={2} style={{ textAlign: "left" }}>Project</th>{days.map((d) => <th key={d} hidden={!visible.has(d)} className={`dn${[0, 6].includes(dow(d)) ? " we" : ""}`}>{WD[dow(d)].slice(0, 2)}</th>)}<th rowSpan={2}>{range === "month" ? "Total" : "Shown"}</th></tr>
          <tr>{days.map((d) => <th key={d} hidden={!visible.has(d)} className={[0, 6].includes(dow(d)) ? "we" : ""}>{Number(d.slice(8))}</th>)}</tr>
        </thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="ts-proj">
              <label className="ts-pick">
                <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.project}`} />
                <span>
                  <button type="button" className="linkbtn" onClick={(e) => { e.preventDefault(); setActive(r.id); setView("calendar"); }} title="Open this project as a calendar">{r.project}</button>
                  {r.substituting && <><br /><span className="muted">covering for {r.substituting}</span></>}
                </span>
              </label>
            </td>
            {days.map((d) => { const c = r.cells[d]; return <td key={d} hidden={!visible.has(d)} className={c.leave ? "lv" : c.holiday ? "ph" : c.weekend ? "we" : ""} title={c.holiday}>{input(r, d, c)}</td>; })}
            <td className="num"><b>{fmt(vis.reduce((t, d) => t + num(vals[`h_${r.id}_${d}`] ?? ""), 0))}</b>{range !== "month" && <div className="muted ts-month">month {fmt(monthTotal(r))} h</div>}</td>
          </tr>))}</tbody>
      </table></div>
    </section>
  );

  if (!phone) {
    return (
      <div ref={ref} className="tscal">
        {switcher}
        {view === "table" ? <>{rangeBar}{table}</> : (
          <>
            {many && <div className="ts-projects" role="tablist" aria-label="Project">{rows.map((r) => <button key={r.id} type="button" role="tab" aria-selected={active === r.id} onClick={() => setActive(r.id)}>{r.project}{r.substituting ? ` (covering ${r.substituting})` : ""}<span>{fmt(monthTotal(r))} h</span></button>)}</div>}
            {rows.map((r) => calendar(r))}
          </>
        )}
        {switchBox}
      </div>
    );
  }

  // phone: one row per day with the day name. Weekends stay hidden unless the customer asked for that work.
  const shown = days.filter((d) => { const any = rows.some((r) => r.cells[d].weekend || r.cells[d].holiday); return !any || nonworking || rows.some((r) => (vals[`h_${r.id}_${d}`] ?? "") !== "" || r.cells[d].leave); });
  return (
    <div ref={ref} className="tsm">
      {rows.map((r) => <div key={r.id} className="card">{toolbar(r)}</div>)}
      {shown.map((d) => {
        const wd = dow(d), any = rows[0].cells[d];
        const tag = rows.some((r) => r.cells[d].leave) ? "leave" : any.holiday ? "holiday" : "";
        return (
          <div key={d} className={`tsm-day ${wd === 0 || wd === 6 ? "we" : ""} ${tag}`}>
            <div className="tsm-date"><b>{Number(d.slice(8))}</b> <span>{WD[wd]}</span>{tag === "leave" && <em>Leave</em>}{tag === "holiday" && <em title={any.holiday}>Public holiday</em>}</div>
            <div className="tsm-inputs">
              {rows.map((r) => <label key={r.id} className={!open(r.cells[d]) ? "off" : ""}>{rows.length > 1 && <span>{r.project}</span>}{input(r, d, r.cells[d])}</label>)}
            </div>
          </div>
        );
      })}
      {switchBox}
    </div>
  );
}
