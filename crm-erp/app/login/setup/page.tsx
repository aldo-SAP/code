import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { get } from "@/lib/db";
import { readBlob } from "@/lib/auth";
import { beginEnrollment } from "@/lib/mfa";
import { otpauthUri } from "@/lib/totp";
import { MfaSetupForm } from "@/components/MfaForms";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";
export default async function Setup() {
  const b = readBlob<{ uid: number; purpose: string }>((await cookies()).get("mfa_pending")?.value);
  if (!b || b.purpose !== "enroll") redirect("/login");
  const u = (await get<{ email: string }>("SELECT email FROM users WHERE id=? AND active=1", b.uid));
  if (!u) redirect("/login");
  const secret = await beginEnrollment(b.uid);
  const uri = otpauthUri(u!.email, secret);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 180 });
  return (
    <div className="login card" style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><h1 style={{ margin: 0 }}>Set up your authenticator</h1><ThemeToggle /></div>
      <p className="muted">Your company requires an authenticator app for password sign-ins. It takes a minute and you only do it once.</p>
      <MfaSetupForm secret={secret} uri={uri} qr={qr} />
    </div>
  );
}
