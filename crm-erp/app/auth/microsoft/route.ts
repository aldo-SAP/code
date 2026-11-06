import { NextResponse } from "next/server";
import { msConfig, newFlow, authorizeUrl } from "@/lib/msauth";
import { signBlob } from "@/lib/auth";
import { safeNext } from "@/lib/nexturl";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = msConfig();
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  if (!c) return NextResponse.redirect(new URL("/login?err=" + encodeURIComponent("Microsoft sign-in is not set up"), req.url));
  const f = newFlow();
  const res = NextResponse.redirect(authorizeUrl(c, f));
  res.cookies.set("ms_flow", signBlob({ state: f.state, nonce: f.nonce, verifier: f.verifier, next }), {
    httpOnly: true, sameSite: "lax", path: "/auth/microsoft", maxAge: 600, secure: c.appUrl.startsWith("https://"),
  });
  return res;
}
