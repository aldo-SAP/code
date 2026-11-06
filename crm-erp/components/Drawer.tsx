"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A button that opens a form in a panel from the right. Closes with Esc, a click outside, Cancel, or after the page reloads from a save. */
export default function Drawer({ button, title, children }: { button: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname(), sp = useSearchParams().toString();
  const ref = useRef<HTMLElement>(null), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [path, sp]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => { removeEventListener("keydown", esc); opener.current?.focus(); };
  }, [open]);
  return (
    <>
      <button type="button" ref={opener} onClick={() => setOpen(true)}>+ {button}</button>
      <div className={`scrim${open ? " on" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside ref={ref} className={`drawer${open ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open} inert={!open}>
        <header><h2>{title}</h2><button type="button" className="x" onClick={() => setOpen(false)} aria-label="Close">&times;</button></header>
        <div className="drawer-body" onClick={(e) => { if ((e.target as HTMLElement).closest("[data-cancel]")) setOpen(false); }}>{children}</div>
      </aside>
    </>
  );
}
