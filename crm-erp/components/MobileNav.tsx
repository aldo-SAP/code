"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/icons";
import NavLinks, { type NavGroup } from "@/components/NavLinks";

/** Phone navigation: a sticky top bar with a hamburger button (icon and the word Menu) that opens the same grouped menu. Closes after you pick a page. */
export default function MobileNav({ groups, logo, children }: { groups: NavGroup[]; logo: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const items = groups.flatMap((g) => g.items);
  const current = items.filter(([h]) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"))).sort((a, b) => b[0].length - a[0].length)[0];
  return (
    <header className="topbar">
      <div className="bar0">
        <button type="button" className="menubtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu"><Icon name={open ? "close" : "menu"} size={20} /><span>{open ? "Close" : "Menu"}</span></button>
        <b className="pagetitle">{current?.[1] ?? "Home"}</b>
        <span className="logo-sm">{logo}</span>
      </div>
      {open && (
        <nav id="mobile-menu" className="menu" aria-label="Main">
          <NavLinks groups={groups} />
          {children}
        </nav>
      )}
    </header>
  );
}
