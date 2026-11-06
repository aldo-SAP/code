import { all, setting } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { addFx, addUser, saveSettings, setUserActive, setUserAuth } from "@/app/actions";
import { msConfig, redirectUri } from "@/lib/msauth";
import { Badge, CURRENCIES, Field, Flash, Hidden, today } from "@/components/ui";

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const users = await all<any>("SELECT u.*, p.name AS person FROM users u LEFT JOIN people p ON p.id=u.person_id ORDER BY u.id");
  const people = await all<any>("SELECT id,name FROM people ORDER BY name");
  const ms = msConfig();
  const fx = await all<any>("SELECT * FROM fx_rates ORDER BY currency, as_of DESC");
  return (
    <>
      <h2>Settings</h2><Flash sp={sp} />
      <h3>Company (shown on invoices)</h3>
      <form action={saveSettings} className="row card">
        <Field label="Company name"><input name="company_name" defaultValue={await setting("company_name")} /></Field>
        <Field label="Address"><input name="company_address" defaultValue={await setting("company_address")} /></Field>
        <Field label="Registration / tax no."><input name="company_vat_or_reg" defaultValue={await setting("company_vat_or_reg")} /></Field>
        <Field label="IBAN / payment details"><input name="company_iban" defaultValue={await setting("company_iban")} /></Field><button>Save</button>
      </form>
      <h3>Backup</h3>
      <div className="card">
        <a className="btn" href="/backup">Download full data export (JSON)</a>
        <p className="muted" style={{ marginBottom: 0 }}>Supabase also keeps its own daily backups. Download an export about once a week and keep it somewhere safe outside the hosting accounts. Every download is logged.</p>
      </div>
      <h3>Microsoft sign-in</h3>
      <div className="card">
        {ms ? <>Active for tenant <code>{ms.tenant}</code>. Redirect URI registered in Entra must be exactly: <code>{redirectUri(ms)}</code></>
          : <>Not configured. Set <code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code> and <code>APP_URL</code> on the server (see the README), then restart.</>}
        <p className="muted" style={{ marginBottom: 0 }}>Only users you create below can sign in. Nobody is created automatically. Keep your own admin on "both" as a safety net.</p>
      </div>
      <h3>Users</h3>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Sign-in</th><th>Linked person</th><th></th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><Badge v={u.role} /></td>
          <td><form action={setUserAuth} className="row"><Hidden name="id" value={u.id} /><select name="auth_method" defaultValue={u.auth_method}><option value="password">password</option><option value="microsoft">Microsoft</option><option value="both">both</option></select><button className="sec sm">Save</button></form>{u.ms_oid ? <span className="muted">Microsoft linked</span> : null}</td><td>{u.person}</td>
          <td><form action={setUserActive}><Hidden name="id" value={u.id} /><button name="active" value={u.active ? 0 : 1} className="sec sm">{u.active ? "Deactivate" : "Activate"}</button></form></td></tr>)}</tbody></table>
      <form action={addUser} className="row card" style={{ marginTop: 8 }}>
        <Field label="Name"><input name="name" /></Field><Field label="Email"><input name="email" type="email" required /></Field>
        <Field label="Sign-in"><select name="auth_method" defaultValue={ms ? "microsoft" : "password"}><option value="microsoft">Microsoft (staff)</option><option value="password">password (freelancers without Microsoft)</option><option value="both">both</option></select></Field>
        <Field label="Password (not needed for Microsoft)"><input name="password" type="password" minLength={8} autoComplete="new-password" /></Field>
        <Field label="Role"><select name="role"><option value="worker">worker (own timesheet)</option><option value="manager">manager</option><option value="admin">admin</option></select></Field>
        <Field label="Linked person (needed for workers)"><select name="person_id"><option value="">-</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <button>Create user</button>
      </form>
      <h3>Exchange rates (1 unit = x EUR)</h3>
      <table><tbody>{fx.map((f) => <tr key={f.id}><td>{f.currency}</td><td>{f.rate_to_eur}</td><td>{f.as_of}</td></tr>)}{!fx.length && <tr><td className="muted">Only needed for non-EUR amounts in margin reports.</td></tr>}</tbody></table>
      <form action={addFx} className="row" style={{ marginTop: 8 }}>
        <Field label="Currency"><select name="currency">{CURRENCIES.filter((c) => c !== "EUR").map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="EUR per 1 unit"><input name="rate_to_eur" type="number" step="0.000001" required /></Field>
        <Field label="As of"><input name="as_of" type="date" defaultValue={today()} required /></Field><button className="sec">Save rate</button>
      </form>
    </>
  );
}
