import Link from "next/link";
import { logout } from "@/app/actions";
import { can, type User } from "@/lib/auth";

export const money = (n: number | null | undefined, c = "EUR") =>
  n == null ? "-" : new Intl.NumberFormat("en-IE", { style: "currency", currency: c }).format(n);
export const num = (n: number, d = 2) => new Intl.NumberFormat("en-IE", { maximumFractionDigits: d }).format(n);
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7);

export function Flash({ sp }: { sp: { msg?: string; err?: string } }) {
  if (sp.err) return <div className="flash err">{sp.err}</div>;
  if (sp.msg) return <div className="flash ok">{sp.msg}</div>;
  return null;
}

const tone: Record<string, string> = {
  approved: "ok", paid: "ok", won: "ok", active: "ok", completed: "ok", ready: "ok", issued: "warn", submitted: "warn",
  draft: "", planned: "", rejected: "err", void: "err", lost: "err", dropped: "err",
};
export const Badge = ({ v }: { v: string }) => <span className={`badge ${tone[v] ?? ""}`}>{v}</span>;

export function Nav({ user }: { user: User }) {
  const items: [string, string][] = user.role === "worker"
    ? [["/timesheets", "My timesheet"]]
    : [["/", "Dashboard"], ["/clients", "Clients"], ["/deals", "Pipeline"], ["/people", "People"], ["/courses", "Training"],
       ["/projects", "Projects"], ["/timesheets", "Timesheets"], ["/approvals", "Approvals"], ["/invoices", "Invoices"],
       ...(can.finance(user) ? [["/payouts", "Payouts"], ["/reports", "Margin"]] as [string, string][] : []),
       ["/unlock", "Unlock billed hours"], ["/import", "CSV import"], ...(can.admin(user) ? [["/audit", "Audit log"], ["/settings", "Settings"]] as [string, string][] : [])];
  return (
    <nav className="side">
      <h1>Talent CRM/ERP</h1>
      {items.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      <div className="who">{user.name}<br />{user.role}</div>
      <form action={logout}><button className="sec sm">Sign out</button></form>
    </nav>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="f">{label}{children}</label>;
}
export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "PLN", "RON", "ALL"];
export function CurrencySelect({ name = "currency", value = "EUR" }: { name?: string; value?: string }) {
  const list = CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES];
  return <select name={name} defaultValue={value}>{list.map((c) => <option key={c}>{c}</option>)}</select>;
}
export function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} />;
}
