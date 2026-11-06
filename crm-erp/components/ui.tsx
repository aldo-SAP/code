import Link from "next/link";
import { logout } from "@/app/actions";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
import NavLinks from "@/components/NavLinks";
import { can, type User } from "@/lib/auth";
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

export function Nav({ user }: { user: User }) {
  type Item = [string, string];
  const groups: { label: string; items: Item[]; closed?: boolean }[] = user.role === "worker"
    ? [{ label: "", items: [["/timesheets", "My timesheet"], ["/leave", "My leave"], ["/account", "My account"]] }]
    : [
        { label: "", items: [["/", "Dashboard"]] },
        { label: "Sales", items: [["/clients", "Clients"], ["/deals", "Pipeline"]] },
        { label: "Talent", items: [["/people", "People"], ["/courses", "Training"]] },
        { label: "Delivery", items: [["/projects", "Projects"], ["/timesheets", "Timesheets"], ["/approvals", "Approvals"], ["/leave", "Leave"], ["/team", "Team calendar"], ["/checklist", "Month end"]] },
        { label: "Finance", items: [["/invoices", "Invoices"], ...(can.finance(user) ? [["/payouts", "Payouts"], ["/reports", "Margin"]] as Item[] : [])] },
        { label: "Admin", closed: true, items: [["/unlock", "Unlock billed hours"], ["/import", "CSV import"], ...(can.admin(user) ? [["/holidays", "Public holidays"], ["/audit", "Audit log"], ["/settings", "Settings"]] as Item[] : [])] },
        { label: "", items: [["/account", "My account"]] },
      ];
  const items = groups.flatMap((g) => g.items);
  return (
    <>
      <nav className="side" aria-label="Main">
        <div className="brand">Talent CRM/ERP</div>
        <NavLinks groups={groups} />
        <div className="who">{user.name}<br />{user.role}</div>
        <ThemeToggle />
        <form action={logout}><button className="sec sm" style={{ margin: "0 8px" }}>Sign out</button></form>
      </nav>
      <MobileNav items={items} who={user.name}>
        <ThemeToggle />
        <form action={logout}><button className="sec sm">Sign out</button></form>
      </MobileNav>
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
