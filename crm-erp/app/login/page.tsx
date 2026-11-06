import { login } from "@/app/actions";
import { Flash } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";
import { msConfig } from "@/lib/msauth";
import { safeNext } from "@/lib/nexturl";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <div className="login card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><h1 style={{ margin: 0 }}>Talent CRM/ERP</h1><ThemeToggle /></div>
      <Flash sp={sp} />
      {msConfig() && <p><a className="btn" href={`/auth/microsoft${next ? `?next=${encodeURIComponent(next)}` : ""}`} style={{ display: "block", textAlign: "center" }}>Sign in with Microsoft</a></p>}
      {msConfig() && <p className="muted" style={{ textAlign: "center", margin: "4px 0 10px" }}>or, if you do not have a Microsoft account</p>}
      <form action={login} style={{ display: "grid", gap: 10 }}>
        {next && <input type="hidden" name="next" value={next} />}
        <input aria-label="Email" name="email" type="email" placeholder="Email" required autoFocus />
        <input aria-label="Password" name="password" type="password" placeholder="Password" required />
        <button>Sign in</button>
      </form>
    </div>
  );
}
