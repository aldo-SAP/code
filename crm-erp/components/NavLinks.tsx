"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sidebar links; the current section is highlighted and announced. */
export default function NavLinks({ items }: { items: [string, string][] }) {
  const path = usePathname();
  const current = items.filter(([h]) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"))).sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  return <>{items.map(([href, label]) => <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>{label}</Link>)}</>;
}
