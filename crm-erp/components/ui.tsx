import Link from "next/link";
import { logout } from "@/app/actions";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
import NavLinks from "@/components/NavLinks";
import { can, type User } from "@/lib/auth";
import { setting } from "@/lib/db";
import { tone } from "@/lib/tone";

export const money = (n: number | null | undefined, c = "EUR") =>
  n == null ? "-" : new Intl.NumberFormat("en-IE", { style: "currency", currency: c }).format(n);
export const num = (n: number, d = 2) => new Intl.NumberFormat("en-IE", { maximumFractionDigits: d }).format(n);
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7);

export function Flash({ sp }: { sp: { msg?: string; err?: string } }) {
  if (sp.err) return <div className="flash err" role="alert">{sp.err}</div>;
  if (sp.msg) return <div className="flash ok" role="status">{sp.msg}</div>;
  return null;
}

export const Badge = ({ v }: { v: string }) => <span className={`badge ${tone[v] ?? ""}`}>{v}</span>;

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Company mark: the uploaded logo (Settings, an https address) or a placeholder until there is one. */
async function Logo() {
  const url = await setting("company_logo_url", ""), name = await setting("company_name", "Your company");
  return (
    <span className="logo">
      {/^https:\/\//.test(url)
        ? <img src={url} alt="" className="logo-img" />
        : <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M9 11h14M16 11v11" stroke="var(--brand-fg)" strokeWidth="3" strokeLinecap="round" fill="none" /></svg>}
      <span className="logo-name">{name}</span>
    </span>
  );
}

export async function Nav({ user }: { user: User }) {
  type Item = [string, string, string];
  const groups: { label: string; items: Item[]; closed?: boolean }[] = user.role === "worker"
    ? [{ label: "", items: [["/timesheets", "My timesheet", "clock"], ["/leave", "My leave", "sun"]] }]
    : [
        { label: "", items: [["/", "Dashboard", "home"]] },
        { label: "Sales", items: [["/clients", "Clients", "building"], ["/deals", "Pipeline", "funnel"]] },
        { label: "Talent", items: [["/people", "People", "users"], ["/courses", "Training", "cap"]] },
        { label: "Delivery", items: [["/projects", "Projects", "folder"], ["/timesheets", "Timesheets", "clock"], ["/approvals", "Approvals", "check"], ["/leave", "Leave", "sun"], ["/team", "Team calendar", "cal"], ["/checklist", "Month end", "flag"]] },
        { label: "Finance", items: [["/invoices", "Invoices", "doc"], ...(can.finance(user) ? [["/payouts", "Payouts", "wallet"], ["/reports", "Margin", "chart"]] as Item[] : [])] },
        { label: "Admin", closed: true, items: [["/unlock", "Unlock billed hours", "lock"], ["/import", "CSV import", "upload"], ...(can.admin(user) ? [["/holidays", "Public holidays", "globe"], ["/audit", "Audit log", "log"], ["/settings", "Settings", "gear"]] as Item[] : [])] },
      ];
  const logo = await Logo();
  const account = (
    <div className="acct">
      <Link href="/account" className="acct-card"><span className="av">{initials(user.name)}</span><span><b>{user.name}</b><small>{user.role} · My account</small></span></Link>
      <div className="acct-row"><ThemeToggle /><form action={logout}><button className="sec sm">Sign out</button></form></div>
    </div>
  );
  return (
    <>
      <nav className="side" aria-label="Main">
        <div className="brand">{logo}</div>
        <div className="navscroll"><NavLinks groups={groups} /></div>
        {account}
      </nav>
      <MobileNav groups={groups} logo={logo}>{account}</MobileNav>
    </>
  );
}

export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={full ? "f wide" : "f"}><span className="lbl">{label}</span>{children}</label>;
}
export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "PLN", "RON", "ALL"];
export function CurrencySelect({ name = "currency", value = "EUR", label }: { name?: string; value?: string; label?: string }) {
  const list = CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES];
  return <select name={name} defaultValue={value} aria-label={label}>{list.map((c) => <option key={c}>{c}</option>)}</select>;
}
export function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} />;
}
