import QRCode from "qrcode";
import { get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { beginEnrollment, mfaRequiredFor, mfaStatus } from "@/lib/mfa";
import { otpauthUri } from "@/lib/totp";
import { disableMfaAction } from "@/app/actions";
import { MfaSetupForm, RegenForm } from "@/components/MfaForms";
import { Badge, Flash } from "@/components/ui";
import PageHead from "@/components/PageHead";

export default async function Account({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const row = (await get<{ auth_method: string; email: string; name: string }>("SELECT auth_method,email,name FROM users WHERE id=?", user.id))!;
  const passwordLogin = row.auth_method !== "microsoft";
  const st = await mfaStatus(user.id);
  const required = await mfaRequiredFor(user.role);
  let setup: { secret: string; uri: string; qr: string } | null = null;
  if (passwordLogin && !st.enabled) {
    const secret = await beginEnrollment(user.id);
    const uri = otpauthUri(row.email, secret);
    setup = { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 180 }) };
  }
  return (
    <>
      <PageHead title="My account" sub="Your sign-in and security." /><Flash sp={sp} />
      <div className="card"><b>{row.name}</b><div className="muted">{row.email} · {user.role} · signs in with {row.auth_method === "microsoft" ? "Microsoft" : row.auth_method === "both" ? "Microsoft or password" : "a password"}</div></div>
      <h2>Authenticator app</h2>
      {!passwordLogin ? (
        <div className="card muted">You sign in with Microsoft, so multi-factor sign-in is handled by your Microsoft account. Nothing to set up here.</div>
      ) : st.enabled ? (
        <>
          <div className="card"><Badge v="approved" /> On. A 6-digit code from your app is needed after your password. <span className="muted">{st.recoveryLeft} recovery code{st.recoveryLeft === 1 ? "" : "s"} left.</span></div>
          <h2>Recovery codes</h2>
          <RegenForm />
          <h2>Turn off</h2>
          {required ? <p className="muted">Your company requires an authenticator for your role, so it cannot be turned off.</p> : (
            <form action={disableMfaAction} className="row">
              <label className="f">Current 6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required style={{ width: 160 }} /></label>
              <button className="danger">Turn off authenticator</button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="muted">{required ? "Required for your role: you must set this up." : "Recommended: a stolen password alone will no longer be enough to sign in."}</p>
          <MfaSetupForm secret={setup!.secret} uri={setup!.uri} qr={setup!.qr} />
        </>
      )}
    </>
  );
}
