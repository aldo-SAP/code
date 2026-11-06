import { login } from "@/app/actions";
import { Flash } from "@/components/ui";
import { msConfig } from "@/lib/msauth";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login card">
      <h2>Talent CRM/ERP</h2>
      <Flash sp={sp} />
      {msConfig() && <p><a className="btn" href="/auth/microsoft" style={{ display: "block", textAlign: "center" }}>Sign in with Microsoft</a></p>}
      {msConfig() && <p className="muted" style={{ textAlign: "center", margin: "4px 0 10px" }}>or, if you do not have a Microsoft account</p>}
      <form action={login} style={{ display: "grid", gap: 10 }}>
        <input name="email" type="email" placeholder="Email" required autoFocus />
        <input name="password" type="password" placeholder="Password" required />
        <button>Sign in</button>
      </form>
    </div>
  );
}
