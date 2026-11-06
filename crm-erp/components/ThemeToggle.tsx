"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const read = (): Mode => {
  try { const m = document.cookie.match(/(?:^|; )theme=(light|dark)/); return m ? (m[1] as Mode) : "system"; } catch { return "system"; }
};

/** System follows the device. Light/Dark are remembered in a cookie so the server can render the right theme without a flash. */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => setMode(read()), []);
  const apply = (m: Mode) => {
    setMode(m);
    const root = document.documentElement;
    if (m === "system") { root.removeAttribute("data-theme"); document.cookie = "theme=; path=/; max-age=0; SameSite=Lax"; }
    else { root.setAttribute("data-theme", m); document.cookie = `theme=${m}; path=/; max-age=31536000; SameSite=Lax`; }
  };
  return (
    <div className="theme" role="group" aria-label="Colour theme">
      {(["system", "light", "dark"] as Mode[]).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => apply(m)}>{m === "system" ? "Auto" : m === "light" ? "Light" : "Dark"}</button>
      ))}
    </div>
  );
}
