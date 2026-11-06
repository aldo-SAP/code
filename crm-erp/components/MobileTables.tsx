"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * On phones, data tables become stacked cards. This copies each column header onto its cells (data-label)
 * so the card can show "Label: value". Runs after every page change; tables that must stay a grid opt out with "nostack".
 */
export default function MobileTables() {
  const path = usePathname();
  useEffect(() => {
    document.querySelectorAll<HTMLTableElement>(".main table:not(.nostack):not(.ts):not(.cal)").forEach((t) => {
      t.classList.add("stack");
      const heads = [...t.querySelectorAll("thead th")].map((h) => (h.textContent ?? "").trim());
      t.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
        [...tr.children].forEach((td, i) => { if (!td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i] ?? ""); });
      });
    });
  }, [path]);
  return null;
}
