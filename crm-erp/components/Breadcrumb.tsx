import Link from "next/link";

/** Where you are, for pages three levels deep. The last item is the current page. */
export default function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>{items.map((it, i) => <li key={i} aria-current={i === items.length - 1 ? "page" : undefined}>{it.href ? <Link href={it.href}>{it.label}</Link> : it.label}</li>)}</ol>
    </nav>
  );
}
