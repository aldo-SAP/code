"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { tone } from "@/lib/tone";

/** A cell is plain text, a number, or text with a link, a status badge and a small second line. */
export type Cell = string | number | null | { t: string; s?: string | number; href?: string; badge?: boolean; bad?: boolean; sub?: string; detail?: string };
export type Row = { id: string | number } & Record<string, Cell>;
export interface Col { key: string; label: string; filter?: "text" | "select" | "none"; num?: boolean; phoneHidden?: boolean }

const text = (c: Cell) => (c == null ? "" : typeof c === "object" ? c.t : String(c));
const sortKey = (c: Cell) => (typeof c === "number" ? c : c != null && typeof c === "object" ? (c.s ?? c.t.toLowerCase()) : String(c ?? "").toLowerCase());

/**
 * Sortable, filterable table (TanStack Table). Click a heading to sort by it; hold Shift (or Ctrl/Cmd) and click more headings to sort by several columns.
 * Each column can have its own filter, there is a search box over all columns, optional tabs with counts, and paging.
 */
export default function DataTable({ cols, rows, tabs, tabLabel = "All", empty = "Nothing here yet.", pageSize = 10, initialSort, foot }: {
  cols: Col[]; rows: Row[]; foot?: Cell[]; tabs?: { key: string; values: string[] }; tabLabel?: string; empty?: string; pageSize?: number; initialSort?: { id: string; desc: boolean }[];
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [{ id: cols[0].key, desc: false }]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("");
  const data = useMemo(() => (tabs && tab ? rows.filter((r) => text(r[tabs.key]) === tab) : rows), [rows, tabs, tab]);
  const columns = useMemo<ColumnDef<Row>[]>(() => cols.map((c) => ({
    id: c.key, accessorFn: (r) => sortKey(r[c.key]), header: c.label, meta: c,
    filterFn: (row, id, v: string) => (c.filter === "select" ? text(row.original[c.key]) === v : text(row.original[c.key]).toLowerCase().includes(v.toLowerCase())),
    sortUndefined: "last",
  })), [cols]);
  const columnFilters = useMemo(() => Object.entries(filters).filter(([, v]) => v).map(([id, value]) => ({ id, value })), [filters]);
  const table = useReactTable({
    data, columns, state: { sorting, columnFilters, globalFilter: q },
    onSortingChange: setSorting, enableMultiSort: true, isMultiSortEvent: (e) => (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey,
    globalFilterFn: (row, _id, v: string) => cols.some((c) => { const x = row.original[c.key]; return (text(x) + " " + (x && typeof x === "object" ? x.sub ?? "" : "")).toLowerCase().includes(String(v).toLowerCase()); }),
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }, autoResetPageIndex: false,
  });
  const first = () => table.setPageIndex(0);
  const options = (key: string) => [...new Set(rows.map((r) => text(r[key])).filter(Boolean))].sort();
  const shown = table.getFilteredRowModel().rows.length;
  const filtered = !!q || Object.values(filters).some(Boolean);
  const pg = table.getState().pagination;
  const render = (c: Cell) => {
    if (c == null || c === "") return "-";
    if (typeof c !== "object") return c;
    const inner = c.badge || c.bad ? <span className={`badge ${c.bad ? "err" : tone[c.t] ?? ""}`}>{c.t}</span> : c.t;
    return <>{c.href ? <Link href={c.href}>{inner}</Link> : inner}{c.sub && <><br /><span className="muted">{c.sub}</span></>}{c.detail && <details><summary className="muted" style={{ cursor: "pointer" }}>details</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 4 }}>{c.detail}</pre></details>}</>;
  };
  return (
    <div className="card dt">
      {tabs && (
        <div className="dt-tabs" role="tablist">
          {["", ...tabs.values].map((v) => <button key={v || "all"} type="button" role="tab" aria-selected={tab === v} onClick={() => { setTab(v); first(); }}>{v || tabLabel}<span>{v ? rows.filter((r) => text(r[tabs.key]) === v).length : rows.length}</span></button>)}
        </div>
      )}
      <div className="dt-tools">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); first(); }} placeholder="Search" aria-label="Search the table" />
        <span className="muted dt-hint">Click a heading to sort. Shift+click adds a second or third sort.</span>
      </div>
      <div className="tw"><table className="dt-table">
        <thead>
          <tr>{table.getHeaderGroups()[0].headers.map((h) => {
            const c = h.column.columnDef.meta as Col, dir = h.column.getIsSorted(), idx = h.column.getSortIndex();
            return (
              <th key={h.id} scope="col" className={`sort${c.num ? " num" : ""}${c.phoneHidden ? " hide-s" : ""}`} aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={h.column.getToggleSortingHandler()} title="Sort. Shift+click to add another column.">
                  {c.label}<span className="ar" aria-hidden="true">{dir ? (dir === "asc" ? "▲" : "▼") : "↕"}{dir && sorting.length > 1 ? <sup>{idx + 1}</sup> : null}</span>
                </button>
              </th>
            );
          })}</tr>
          <tr className="dt-filters">{cols.map((c) => (
            <th key={c.key} className={c.phoneHidden ? "hide-s" : ""}>
              {c.filter === "none" ? null : c.filter === "select"
                ? <select aria-label={`Filter ${c.label}`} value={filters[c.key] ?? ""} onChange={(e) => { setFilters({ ...filters, [c.key]: e.target.value }); first(); }}><option value="">All</option>{options(c.key).map((o) => <option key={o}>{o}</option>)}</select>
                : <input aria-label={`Filter ${c.label}`} placeholder="Filter" value={filters[c.key] ?? ""} onChange={(e) => { setFilters({ ...filters, [c.key]: e.target.value }); first(); }} />}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => <tr key={r.original.id}>{cols.map((c) => <td key={c.key} data-label={c.label} className={`${c.num ? "num" : ""}${c.phoneHidden ? " hide-s" : ""}`}>{render(r.original[c.key])}</td>)}</tr>)}
          {!table.getRowModel().rows.length && <tr><td colSpan={cols.length} data-label="" className="muted">{rows.length ? "Nothing matches. Clear the filters or pick another tab." : empty}</td></tr>}
        </tbody>
        {foot && <tfoot><tr>{cols.map((c, i) => <td key={c.key} data-label={i === 0 ? "" : c.label} className={c.num ? "num" : ""}><b>{render(foot[i] ?? "")}</b></td>)}</tr></tfoot>}
      </table></div>
      <div className="dt-foot">
        <span>{shown} of {rows.length}{filtered && <> <button type="button" className="linkbtn" onClick={() => { setFilters({}); setQ(""); }}>Clear filters</button></>}{sorting.length > 1 && <> <button type="button" className="linkbtn" onClick={() => setSorting([{ id: cols[0].key, desc: false }])}>Reset sort</button></>}</span>
        <span className="dt-pager">
          <label className="muted">Rows <select value={pg.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}>{[5, 10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button type="button" className="sec sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">&larr;</button>
          <span>{pg.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span>
          <button type="button" className="sec sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">&rarr;</button>
        </span>
      </div>
    </div>
  );
}
