import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readBlob } from "@/lib/auth";
import { verifyMfaAction } from "@/app/actions";
import { Flash } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";
export default async function Verify({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const b = readBlob<{ purpose: string }>((await cookies()).get("mfa_pending")?.value);
  if (!b || b.purpose !== "verify") redirect("/login");
  const sp = await searchParams;
  return (
    <div className="login card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><h1 style={{ margin: 0 }}>Enter your code</h1><ThemeToggle /></div>
      <p className="muted">Open your authenticator app and enter the 6-digit code for Talent CRM. Lost your phone? Enter one of your recovery codes instead.</p>
      <Flash sp={sp} />
      <form action={verifyMfaAction} style={{ display: "grid", gap: 10 }}>
        <input name="code" aria-label="Authenticator or recovery code" inputMode="text" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="123456 or recovery code" required autoFocus />
        <button>Sign in</button>
      </form>
      <p className="muted" style={{ marginBottom: 0 }}><Link href="/login">Back to sign in</Link>. Locked out completely? Ask an admin to reset your authenticator.</p>
    </div>
  );
}
