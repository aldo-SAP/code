import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { billedEntries } from "@/lib/history";
import { unlockBilled } from "@/app/actions";
import { Badge, Field, Flash, Hidden, num, thisMonth } from "@/components/ui";
import { fmtDate } from "@/lib/dates";

export default async function Unlock({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; person?: string; month?: string; invoice?: string }> }) {
  const user = await requireManager();
  const sp = await searchParams;
  const admin = can.admin(user);
  const people = await all<any>("SELECT id,name FROM people WHERE stage IN ('ready','placed') ORDER BY name");
  const month = sp.month ?? thisMonth();
  const rows = sp.invoice ? await billedEntries("t.invoice_id=?", Number(sp.invoice))
    : sp.person ? await billedEntries("t.worker_id=? AND substr(t.work_date,1,7)=?", Number(sp.person), month) : [];
  const paid = rows.some((r) => r.invoice_status === "paid" || r.payout_status === "paid");
  const needAdmin = rows.some((r) => r.invoice_status === "issued" || r.payout_status === "approved");
  const blocked = paid || (needAdmin && !admin);
  const back = `/unlock?${sp.invoice ? `invoice=${sp.invoice}` : `person=${sp.person ?? ""}&month=${month}`}`;
  return (
    <>
      <h2>Unlock billed hours</h2><Flash sp={sp} />
      <div className="card"><b>History warning.</b> These hours are part of an invoice or payout. Reopening them changes history: every step is written to the audit log with your name and reason.</div>
      <form className="row card">
        <Field label="Person"><select name="person" defaultValue={sp.person ?? ""}><option value="">-</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Month"><input type="month" name="month" defaultValue={month} /></Field>
        <button className="sec">Show billed days</button>
      </form>
      {!!rows.length && (
        <form action={unlockBilled}>
          <Hidden name="_back" value={back} />
          <div className="tw"><table><thead><tr><th></th><th>Date</th><th>Worker</th><th>Project</th><th className="num">Hours</th><th>Invoice</th><th>Payout</th></tr></thead><tbody>
            {rows.map((r) => <tr key={r.id}><td><input type="checkbox" name="rid" value={r.id} defaultChecked disabled={blocked} /></td><td>{fmtDate(r.work_date)}</td><td>{r.worker}</td><td>{r.project}</td><td className="num">{num(r.hours)}</td>
              <td>{r.invoice_id ? <><Link href={`/invoices/${r.invoice_id}`}>{r.invoice_number ?? `Draft #${r.invoice_id}`}</Link> <Badge v={r.invoice_status!} /></> : "-"}</td>
              <td>{r.payout_id ? <Badge v={r.payout_status!} /> : "-"}</td></tr>)}
          </tbody></table></div>
          <div className="card" style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <b>What will happen</b>
            <ul style={{ margin: 0 }}>
              <li>Selected days go back to <b>draft</b> so they can be corrected, submitted and approved again.</li>
              <li>Draft invoices and payouts are rebuilt without them.</li>
              <li>An <b>issued</b> invoice is voided (kept in the system, marked void) so it can be re-issued. Its number is not reused.</li>
              <li>Paid invoices and paid payouts cannot be reopened.</li>
            </ul>
            {paid && <div className="flash err">Some selected days are on a paid invoice or paid payout. They cannot be reopened.</div>}
            {!paid && needAdmin && !admin && <div className="flash err">An issued invoice or approved payout is involved. Only an admin can reopen these days.</div>}
            {!blocked && <>
              <Field label="Reason (required, saved in the audit log)"><input name="reason" required minLength={5} placeholder="e.g. Client disputed 3 days, hours corrected" style={{ width: "100%" }} /></Field>
              <Field label="Type REOPEN to confirm"><input name="confirm" required autoComplete="off" style={{ width: 160 }} /></Field>
              <div><button className="danger">Reopen selected days</button></div>
            </>}
          </div>
        </form>
      )}
      {!rows.length && (sp.person || sp.invoice) && <p className="muted">No billed days found for that selection.</p>}
    </>
  );
}
