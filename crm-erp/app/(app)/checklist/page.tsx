import Link from "next/link";
import { requireManager } from "@/lib/session";
import { checklist, monthStatus } from "@/lib/reminders";
import { remindAction } from "@/app/actions";
import { Field, Flash, Hidden, thisMonth } from "@/components/ui";
import { fmtDateTime, fmtMonth } from "@/lib/dates";

const LABEL = { nothing: "Nothing yet", draft: "Not submitted", waiting: "Waiting for approval", done: "Approved" } as const;

export default async function MonthEnd({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; month?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const [c, people] = await Promise.all([checklist(period), monthStatus(period)]);
  const steps: { done: boolean; text: string; href: string; cta: string }[] = [
    { done: c.needSubmit === 0, text: c.needSubmit ? `${c.needSubmit} ${c.needSubmit === 1 ? "person has" : "people have"} not submitted their hours` : "Everyone has submitted their hours", href: "#hours", cta: "Remind" },
    { done: c.waitingApproval === 0, text: c.waitingApproval ? `${c.waitingApproval} ${c.waitingApproval === 1 ? "entry waits" : "entries wait"} for approval` : "Nothing waits for approval", href: `/approvals?period=${period}`, cta: "Approve" },
    { done: c.approvedNotInvoiced === 0 && c.draftInvoices === 0, text: c.approvedNotInvoiced ? `${c.approvedNotInvoiced} approved entries are not on an invoice yet` : c.draftInvoices ? `${c.draftInvoices} draft invoices are not issued` : "All approved hours are invoiced and issued", href: `/invoices?period=${period}`, cta: "Invoices" },
    { done: c.draftPayouts === 0, text: c.draftPayouts ? `${c.draftPayouts} payouts are still drafts` : "No draft payouts", href: `/payouts?period=${period}`, cta: "Payouts" },
    { done: c.issuedUnpaid === 0, text: c.issuedUnpaid ? `${c.issuedUnpaid} issued invoices are not paid yet` : "No unpaid invoices", href: "/invoices", cta: "Open" },
  ];
  return (
    <>
      <h1>Month end</h1><Flash sp={sp} />
      <p className="muted">A checklist for closing {fmtMonth(period)}, and a way to nudge people who still owe hours.</p>
      <form className="row card"><Field label="Month"><input type="month" name="month" defaultValue={period} /></Field><button className="sec">Show</button></form>
      <h2>Checklist</h2>
      <ul className="steps">{steps.map((st, k) => <li key={k} className="card row"><span aria-hidden>{st.done ? "✓" : "○"}</span><span className="wide" style={{ flex: "1 1 14rem" }}>{st.text}</span>{!st.done && <Link className="btn sec" href={st.href}>{st.cta}</Link>}</li>)}</ul>
      <h2 id="hours">Hours for {fmtMonth(period)}</h2>
      <div className="tablewrap"><table><thead><tr><th>Person</th><th>Status</th><th className="num">Saved</th><th className="num">Submitted</th><th className="num">Approved</th><th>Last reminder</th><th /></tr></thead><tbody>
        {people.map((p) => <tr key={p.personId}><td>{p.name}</td><td>{LABEL[p.state]}</td><td className="num">{p.draftHours}h</td><td className="num">{p.submittedHours}h</td><td className="num">{p.approvedHours}h</td>
          <td className="muted">{p.lastReminder ? fmtDateTime(p.lastReminder) : "-"}</td>
          <td>{(p.state === "nothing" || p.state === "draft") && <form action={remindAction}><Hidden name="rid" value={p.personId} /><Hidden name="period" value={period} /><button className="sec" disabled={!p.email} title={p.email ? "" : "No email address"}>Remind</button></form>}</td></tr>)}
        {!people.length && <tr><td colSpan={7} className="muted">Nobody has an active assignment this month.</td></tr>}
      </tbody></table></div>
      {c.needSubmit > 0 && <form action={remindAction} style={{ marginTop: 12 }}><Hidden name="period" value={period} /><button>Remind everyone who still owes hours</button><span className="muted"> (nobody gets more than one reminder in 3 days)</span></form>}
    </>
  );
}
