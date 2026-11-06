"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Group = { label: string; items: [string, string][]; closed?: boolean };
/** Sidebar: links grouped by job. Groups fold; the group of the current page is always open, the Admin group starts closed. */
export default function NavLinks({ groups }: { groups: Group[] }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items);
  const current = all.filter(([h]) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"))).sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  const [shut, setShut] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.filter((g) => g.closed).map((g) => [g.label, true])));
  return <>{groups.map((g, i) => {
    const links = g.items.map(([href, label]) => <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>{label}</Link>);
    if (!g.label) return <div key={i} className="navgrp">{links}</div>;
    const hasCurrent = g.items.some(([h]) => h === current);
    const open = hasCurrent || !shut[g.label];
    return (
      <div key={g.label} className="navgrp">
        <button type="button" className="navhead" aria-expanded={open} onClick={() => setShut({ ...shut, [g.label]: open })}>{g.label}<span aria-hidden="true">{open ? "▾" : "▸"}</span></button>
        {open && links}
      </div>
    );
  })}</>;
}
