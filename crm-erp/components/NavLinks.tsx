"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/icons";

export type NavItem = [href: string, label: string, icon: string];
export type NavGroup = { label: string; items: NavItem[]; closed?: boolean };
/**
 * Grouped navigation. Group headings are small muted labels (not links), every link has an icon and a text label,
 * the current page is filled and bold, and the group that holds it is always open. Used in the sidebar and the phone menu.
 */
export default function NavLinks({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items);
  const current = all.filter(([h]) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"))).sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  const [shut, setShut] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.filter((g) => g.closed).map((g) => [g.label, true])));
  return <>{groups.map((g, i) => {
    const hasCurrent = g.items.some(([h]) => h === current);
    const open = !g.label || hasCurrent || !shut[g.label];
    return (
      <div key={g.label || i} className="navgrp">
        {g.label && (
          <button type="button" className="navhead" aria-expanded={open} onClick={() => setShut({ ...shut, [g.label]: open })}>
            {g.label}<Icon name="chevron" size={14} />
          </button>
        )}
        {open && <ul className="navlist">{g.items.map(([href, label, icon]) => (
          <li key={href}><Link href={href} aria-current={href === current ? "page" : undefined}><Icon name={icon} /><span>{label}</span></Link></li>
        ))}</ul>}
      </div>
    );
  })}</>;
}
