"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Phone navigation: a sticky top bar with a menu that closes after you pick a page. */
export default function MobileNav({ items, who, children }: { items: [string, string][]; who: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const current = items.find(([h]) => (h === "/" ? path === "/" : path.startsWith(h)));
  return (
    <header className="topbar">
      <div className="bar0">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu">{open ? "Close" : "Menu"}</button>
        <b style={{ flex: 1, textAlign: "center" }}>{current?.[1] ?? "Talent CRM"}</b>
        <span className="muted" style={{ fontSize: 12 }}>{who}</span>
      </div>
      {open && (
        <nav id="mobile-menu" className="menu">
          {items.map(([href, label]) => <Link key={href} href={href} aria-current={current?.[0] === href ? "page" : undefined}>{label}</Link>)}
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", flexWrap: "wrap" }}>{children}</div>
        </nav>
      )}
    </header>
  );
}
