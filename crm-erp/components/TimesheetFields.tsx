"use client";
import { useSyncExternalStore } from "react";

export interface Cell { v: string; status: string; disabled: boolean; billed: boolean; leave: boolean; holiday?: string; weekend: boolean }
export interface Row { id: number; project: string; substituting?: string; cells: Record<string, Cell>; total: number }

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 820px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isPhone = () => window.matchMedia("(max-width: 820px)").matches;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The hours inputs. A matrix on wide screens, a day-by-day list on phones (same field names, only one is on the page at a time). */
export default function TimesheetFields({ days, rows }: { days: string[]; rows: Row[] }) {
  const phone = useSyncExternalStore(subscribe, isPhone, () => false);
  const cls = (c: Cell) => (c.billed ? "billed" : c.status || "");
  const hint = (c: Cell) => (c.billed ? "Billed: locked. Use Unlock billed hours to change." : c.holiday);

  if (!phone) {
    return (
      <div className="tw"><table className="ts nostack">
        <thead><tr><th style={{ textAlign: "left" }}>Assignment</th>{days.map((d) => <th key={d} className={[0, 6].includes(new Date(d).getUTCDay()) ? "we" : ""}>{Number(d.slice(8))}</th>)}<th>Total</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{r.project}{r.substituting && <><br /><span className="muted">covering for {r.substituting}</span></>}</td>
            {days.map((d) => {
              const c = r.cells[d];
              return <td key={d} className={c.leave ? "lv" : c.holiday ? "ph" : c.weekend ? "we" : ""} title={c.holiday}>
                <input name={`h_${r.id}_${d}`} defaultValue={c.v} disabled={c.disabled} className={cls(c)} title={hint(c)} inputMode="decimal" aria-label={`${r.project} ${d}`} /></td>;
            })}
            <td className="num"><b>{r.total}</b></td>
          </tr>))}</tbody>
      </table></div>
    );
  }

  // phone: one row per day, hide days that are outside every assignment and empty
  const total = rows.reduce((s, r) => s + r.total, 0);
  const shown = days.filter((d) => rows.some((r) => !r.cells[d].disabled || r.cells[d].v !== "") || rows.some((r) => r.cells[d].holiday || r.cells[d].leave));
  return (
    <div className="tsm">
      <div className="tsm-sum"><b>{total}</b> hours logged this month</div>
      {shown.map((d) => {
        const dt = new Date(d + "T00:00:00Z"), wd = dt.getUTCDay();
        const any = rows[0].cells[d];
        const tag = rows.some((r) => r.cells[d].leave) ? "leave" : any.holiday ? "holiday" : "";
        return (
          <div key={d} className={`tsm-day ${wd === 0 || wd === 6 ? "we" : ""} ${tag}`}>
            <div className="tsm-date"><b>{Number(d.slice(8))}</b> <span>{WD[wd]}</span>{tag === "leave" && <em>Leave</em>}{tag === "holiday" && <em title={any.holiday}>Public holiday</em>}{rows.length === 1 && rows[0].substituting && <small>covering for {rows[0].substituting}</small>}</div>
            <div className="tsm-inputs">
              {rows.map((r) => {
                const c = r.cells[d];
                return (
                  <label key={r.id} className={c.disabled && c.v === "" ? "off" : ""}>
                    {rows.length > 1 && <span>{r.project}{r.substituting ? ` (covering for ${r.substituting})` : ""}</span>}
                    <input name={`h_${r.id}_${d}`} defaultValue={c.v} disabled={c.disabled} className={cls(c)} title={hint(c)} inputMode="decimal" placeholder="h" aria-label={`${r.project} ${d}`} />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
