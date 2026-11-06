import { NextResponse } from "next/server";
import { msConfig, exchangeCode, verifyIdToken, resolveUser } from "@/lib/msauth";
import { readBlob, makeSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = msConfig();
  const base = c?.appUrl ?? new URL(req.url).origin;
  const fail = (message: string, who = "microsoft") => {
    audit({ id: null, name: who }, "login_failed", "user", null, `Microsoft sign-in refused: ${message}`);
    const res = NextResponse.redirect(`${base}/login?err=${encodeURIComponent(message)}`);
    res.cookies.delete({ name: "ms_flow", path: "/auth/microsoft" });
    return res;
  };
  if (!c) return fail("Microsoft sign-in is not set up");
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("Microsoft sign-in was cancelled or refused");
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((x) => x.startsWith("ms_flow="))?.slice(8);
  const flow = readBlob<{ state: string; nonce: string; verifier: string }>(cookie);
  const code = url.searchParams.get("code");
  if (!flow || !code || url.searchParams.get("state") !== flow.state) return fail("Sign-in session expired. Please try again");
  let claims;
  try {
    claims = await verifyIdToken(await exchangeCode(c, code, flow.verifier), c, flow.nonce);
  } catch {
    return fail("Microsoft sign-in could not be verified");
  }
  const r = resolveUser(claims);
  if (!r.ok) return fail(r.error, claims.email);
  audit(r.user, "login", "user", r.user.id, "Signed in with Microsoft");
  const res = NextResponse.redirect(`${base}${r.user.role === "worker" ? "/timesheets" : "/"}`);
  res.cookies.set(SESSION_COOKIE, makeSession(r.user.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400, secure: base.startsWith("https://") });
  res.cookies.delete({ name: "ms_flow", path: "/auth/microsoft" });
  return res;
}
