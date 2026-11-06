"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Small behaviours shared by every page:
 *  - confirm before destructive buttons (class "danger", or data-confirm) unless the form already makes you type something
 *  - stop double submits and show that work is in progress
 *  - announce error messages (focus) and dismiss success messages after a few seconds
 */
export default function UxEnhancer() {
  const path = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const onSubmit = (e: Event) => {
      const ev = e as SubmitEvent;
      const form = ev.target as HTMLFormElement;
      const btn = ev.submitter as HTMLElement | null;
      if (form.dataset.busy) { ev.preventDefault(); ev.stopPropagation(); return; }
      const wantsConfirm = btn?.dataset.confirm || (btn?.classList.contains("danger") && !form.querySelector("[required]"));
      if (wantsConfirm) {
        const text = btn!.dataset.confirm || `${(btn!.textContent ?? "").trim()}? This cannot be undone.`;
        if (!window.confirm(text)) { ev.preventDefault(); ev.stopPropagation(); return; }
      }
      form.dataset.busy = "1";
      form.setAttribute("aria-busy", "true");
      window.setTimeout(() => { delete form.dataset.busy; form.removeAttribute("aria-busy"); }, 12000);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("form[data-busy]").forEach((f) => { delete f.dataset.busy; f.removeAttribute("aria-busy"); });
    const flash = document.querySelector<HTMLElement>(".flash");
    if (!flash) return;
    if (flash.getAttribute("role") === "alert") { flash.tabIndex = -1; flash.scrollIntoView({ block: "nearest" }); flash.focus({ preventScroll: true }); return; }
    const t = window.setTimeout(() => {
      flash.style.display = "none";
      const u = new URL(window.location.href);
      if (u.searchParams.has("msg")) { u.searchParams.delete("msg"); window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); }
    }, 7000);
    return () => window.clearTimeout(t);
  }, [path, search]);

  return null;
}
