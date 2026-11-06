// Dates are stored as ISO (2026-12-07) and shown in plain words. Pure, no locale surprises.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parts = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return { y, m, d }; };

/** 2026-12-12 -> "12 Dec 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** 2026-12-12 -> "Sat 12 Dec 2026" */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return `${WEEKDAYS[new Date(iso.slice(0, 10) + "T00:00:00Z").getUTCDay()]} ${fmtDate(iso)}`;
}
/** One day "12 Dec 2026"; same month "7–11 Dec 2026"; same year "28 Nov – 4 Dec 2026"; else both years. */
export function fmtRange(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return "";
  if (!to || to === from) return fmtDate(from);
  const a = parts(from), b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`;
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}
/** "2026-11-06 19:54:46" (UTC) -> "6 Nov 2026, 19:54" */
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return `${fmtDate(ts)}, ${ts.slice(11, 16)}`;
}
/** "2026-11" -> "November 2026" */
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`;
}
/** Open-ended spans: "1 Jan 2026 – 30 Jun 2026", or "since 1 Jan 2026" when there is no end. */
export function fmtSpan(from: string | null | undefined, to: string | null | undefined): string {
  if (!from && !to) return "";
  if (!to) return `since ${fmtDate(from)}`;
  return fmtRange(from, to);
}
/** "2026-10" -> "Oct 2026" */
export function fmtMonthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
