import { login } from "@/app/actions";
import { Flash } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login card">
      <h2>Talent CRM/ERP</h2>
      <Flash sp={sp} />
      <form action={login} style={{ display: "grid", gap: 10 }}>
        <input name="email" type="email" placeholder="Email" required autoFocus />
        <input name="password" type="password" placeholder="Password" required />
        <button>Sign in</button>
      </form>
    </div>
  );
}
