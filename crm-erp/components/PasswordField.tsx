"use client";
import { useState } from "react";

/** Password input with a show/hide toggle. Keeps autofill and paste working. */
export default function PasswordField({ name = "password", autoComplete = "current-password", label = "Password" }: { name?: string; autoComplete?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "stretch" }}>
      <input name={name} type={show ? "text" : "password"} aria-label={label} placeholder={label} autoComplete={autoComplete} required />
      <button type="button" className="sec" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
    </div>
  );
}
