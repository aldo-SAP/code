"use client";
import { useActionState } from "react";
import { confirmMfaAction, finishMfaLoginAction, regenRecoveryAction, type MfaFormState } from "@/app/actions";

function Codes({ codes, href, finish }: { codes: string[]; href?: string; finish?: boolean }) {
  return (
    <div className="card" role="status">
      <b>Save your recovery codes now</b>
      <p className="muted">Each code works once if you lose your phone. They are shown only this time. Store them in a password manager or print them.</p>
      <ul className="codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      {finish && <form action={finishMfaLoginAction}><button>I saved them, continue</button></form>}
      {href && <a className="btn" href={href}>I saved them, continue</a>}
    </div>
  );
}

/** Setup: scan or type the key, then confirm with the first code. */
export function MfaSetupForm({ secret, uri, qr }: { secret: string; uri: string; qr: string }) {
  const [state, action, pending] = useActionState<MfaFormState, FormData>(confirmMfaAction, {});
  if (state.codes) return <Codes codes={state.codes} href={state.href} finish={state.finish} />;
  const spaced = secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
        <li>Open an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password...).</li>
        <li>
          <b>On a computer:</b> scan this code.
          <div><img src={qr} alt="QR code for the authenticator app" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8 }} /></div>
          <b>On this phone:</b> <a href={uri}>tap here to add it to your app</a>, or type this key by hand:
          <div><code style={{ fontSize: 15, letterSpacing: 1 }}>{spaced}</code></div>
        </li>
        <li>Enter the 6-digit code the app shows now.</li>
      </ol>
      <form action={action} className="row">
        <label className="f">6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus style={{ width: 160 }} /></label>
        <button disabled={pending}>{pending ? "Checking..." : "Turn on"}</button>
      </form>
      {state.error && <div className="flash err" role="alert">{state.error}</div>}
    </div>
  );
}

/** New recovery codes (replaces the old set). Needs a current authenticator code. */
export function RegenForm() {
  const [state, action, pending] = useActionState<MfaFormState, FormData>(regenRecoveryAction, {});
  if (state.codes) return <Codes codes={state.codes} />;
  return (
    <form action={action} className="row">
      <label className="f">Current 6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required style={{ width: 160 }} /></label>
      <button className="sec" disabled={pending}>New recovery codes</button>
      {state.error && <span className="flash err" role="alert">{state.error}</span>}
    </form>
  );
}
