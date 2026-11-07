"use client";
import { useEffect, useRef, useState } from "react";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/** "150 / 172 h": hours entered so far against what a normal month would be (8 h per working day). Updates while you type. */
export default function HoursSummary({ logged, expected, days, perDay }: { logged: number; expected: number; days: number; perDay: number }) {
  const [now, setNow] = useState(logged);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form"); if (!form) return;
    const sum = () => setNow([...form.querySelectorAll<HTMLInputElement>("input[name^=h_]")].reduce((s, el) => { const v = Number(el.value.replace(",", ".")); return s + (v > 0 && v <= 24 ? v : 0); }, 0));
    sum(); form.addEventListener("input", sum); return () => form.removeEventListener("input", sum);
  }, []);
  const pct = expected ? Math.min(100, (now / expected) * 100) : 0, diff = now - expected;
  const state = !expected ? "none" : diff > 0 ? "over" : diff === 0 ? "full" : "under";
  return (
    <div className={`hs ${state}`} ref={ref} role="status" aria-live="polite">
      <div className="hs-top"><span className="hs-fig"><b>{fmt(now)}</b> <span className="hs-of">/ {fmt(expected)} h</span></span>
        <span className="hs-msg">{!expected ? "No working days expected this month." : diff === 0 ? "Exactly as expected." : diff > 0 ? `${fmt(diff)} h more than expected` : `${fmt(-diff)} h still to enter`}</span></div>
      <div className="hs-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <div className="hs-note">{days} working day{days === 1 ? "" : "s"} × {perDay} h. Public holidays and approved leave are not counted. You can enter more or less on any day.</div>
    </div>
  );
}
