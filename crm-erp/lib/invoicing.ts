import { all, get, run, tx } from "./db.ts";
import { monthFraction, periodRange, priceEntries, rateAt, round2, toEur, type Rate } from "./billing.ts";

interface AssignmentRow {
  id: number; project_id: number; person_id: number; billing_type: "hourly" | "daily" | "fixed" | "monthly";
  hours_per_day: number; start_date: string; end_date: string | null; role_title: string | null;
  client_id: number; project_name: string; person_name: string; person_type: "internal" | "external";
  net_days: number | null; payment_terms: string | null;
}
interface EntryRow { id: number; work_date: string; hours: number; worker_id: number; worker_name: string }
interface MilestoneRow { id: number; title: string; bill_amount: number; bill_currency: string; cost_amount: number; cost_currency: string }

const ASSIGNMENTS_SQL = `
  SELECT a.id, a.project_id, a.person_id, a.billing_type, a.hours_per_day, a.start_date, a.end_date, a.role_title,
         p.client_id, p.name AS project_name, per.name AS person_name, per.worker_type AS person_type,
         c.net_days, c.payment_terms
  FROM assignments a JOIN projects p ON p.id=a.project_id JOIN people per ON per.id=a.person_id
  LEFT JOIN contracts c ON c.id=a.client_contract_id ORDER BY a.id`;

const ratesOf = (assignmentId: number) =>
  all<Rate>("SELECT kind,amount,currency,effective_from FROM rates WHERE assignment_id=?", assignmentId);

const approvedEntries = (assignmentId: number, end: string) =>
  all<EntryRow>(
    `SELECT t.id,t.work_date,t.hours,t.worker_id,w.name AS worker_name FROM timesheet_entries t
     JOIN people w ON w.id=t.worker_id WHERE t.assignment_id=? AND t.status='approved' AND t.work_date<=?
     AND t.invoice_id IS NULL ORDER BY t.work_date`,
    assignmentId, end,
  );

const monthTag = (month: string, period: string) => (month === period ? "" : ` (${month})`);
const fmtQty = (n: number) => String(Math.round(n * 100) / 100);

// ---------------------------------------------------------------- invoices

interface LineDraft {
  project_id: number; assignment_id: number; person_id: number; kind: string; description: string;
  detail: string | null; quantity: number; unit: string; unit_price: number; amount: number;
}
interface Bucket {
  client_id: number; currency: string; net_days: number; lines: LineDraft[]; entryIds: number[]; milestoneIds: number[];
}

export async function generateInvoices(period: string): Promise<{ invoiceIds: number[]; warnings: string[] }> {
  const { end } = periodRange(period);
  const warnings: string[] = [];
  return await tx(async () => {
    for (const d of await all<{ id: number }>("SELECT id FROM invoices WHERE period=? AND status='draft'", period)) {
      await run("UPDATE timesheet_entries SET invoice_id=NULL WHERE invoice_id=?", d.id);
      await run("UPDATE milestones SET invoice_id=NULL WHERE invoice_id=?", d.id);
      await run("DELETE FROM invoices WHERE id=?", d.id);
    }
    const buckets = new Map<string, Bucket>();
    const bucketFor = (a: AssignmentRow, currency: string, milestoneId?: number) => {
      const key = `${a.client_id}|${currency}|${milestoneId ?? ""}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { client_id: a.client_id, currency, net_days: a.net_days ?? 30, lines: [], entryIds: [], milestoneIds: [] }));
      b.net_days = Math.max(b.net_days, a.net_days ?? 30);
      return b;
    };

    for (const a of await all<AssignmentRow>(ASSIGNMENTS_SQL)) {
      const rates = await ratesOf(a.id);
      const who = a.person_name;
      if (a.billing_type === "hourly" || a.billing_type === "daily") {
        const entries = await approvedEntries(a.id, end);
        const names = new Map(entries.map((e) => [e.worker_id, e.worker_name]));
        const priced = priceEntries(a.billing_type, a.hours_per_day, entries, (e) => rateAt(rates, "bill", e.work_date));
        if (priced.missing.length)
          warnings.push(`${a.project_name} / ${who}: ${priced.missing.length} approved entr${priced.missing.length > 1 ? "ies" : "y"} without a bill rate (first: ${priced.missing[0].work_date}) were not invoiced.`);
        const missingIds = new Set(priced.missing.map((m) => m.id));
        for (const line of priced.lines) {
          const b = bucketFor(a, line.currency);
          // The client sees the assignee only. Substitute hours are listed in the internal detail.
          const subs = Object.entries(line.hours_by_worker).filter(([w]) => Number(w) !== a.person_id);
          b.lines.push({
            project_id: a.project_id, assignment_id: a.id, person_id: a.person_id, kind: a.billing_type,
            description: `${who} - ${a.project_name}${monthTag(line.month, period)}`,
            detail: subs.length ? "Includes " + subs.map(([w, h]) => `${h}h by ${names.get(Number(w))}`).join(", ") : null,
            quantity: line.quantity, unit: line.unit, unit_price: line.unit_price, amount: line.amount,
          });
        }
        const lineMonths = new Set(priced.lines.map((l) => `${l.month}|${l.unit_price}`));
        for (const e of entries) {
          if (missingIds.has(e.id)) continue;
          const r = rateAt(rates, "bill", e.work_date)!;
          if (lineMonths.has(`${e.work_date.slice(0, 7)}|${r.amount}`)) bucketFor(a, r.currency).entryIds.push(e.id);
        }
      } else if (a.billing_type === "monthly") {
        const done = await get(
          `SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id
           WHERE l.assignment_id=? AND l.kind='monthly' AND i.period=? AND i.status<>'void'`, a.id, period);
        if (done) continue;
        const rate = rateAt(rates, "bill", end);
        const fraction = monthFraction(a.start_date, a.end_date, period);
        if (fraction <= 0) continue;
        if (!rate) { warnings.push(`${a.project_name} / ${who}: monthly assignment has no bill rate.`); continue; }
        bucketFor(a, rate.currency).lines.push({
          project_id: a.project_id, assignment_id: a.id, person_id: a.person_id, kind: "monthly",
          description: `${who} - ${a.project_name} (monthly fee${fraction < 1 ? ", prorated" : ""})`, detail: null,
          quantity: Math.round(fraction * 10000) / 10000, unit: "month", unit_price: rate.amount, amount: round2(rate.amount * fraction),
        });
      } else {
        const ms = await all<MilestoneRow>(
          "SELECT * FROM milestones WHERE assignment_id=? AND status='approved' AND invoice_id IS NULL AND approved_on<=? AND bill_amount>0",
          a.id, end);
        for (const m of ms) {
          const b = bucketFor(a, m.bill_currency, a.payment_terms === "milestone" ? m.id : undefined);
          b.lines.push({
            project_id: a.project_id, assignment_id: a.id, person_id: a.person_id, kind: "milestone",
            description: `${a.project_name} - ${m.title}`, detail: `Delivered by ${who}`,
            quantity: 1, unit: "fixed", unit_price: m.bill_amount, amount: m.bill_amount,
          });
          b.milestoneIds.push(m.id);
        }
      }
    }

    const invoiceIds: number[] = [];
    for (const b of buckets.values()) {
      if (!b.lines.length) continue;
      const total = round2(b.lines.reduce((s, l) => s + l.amount, 0));
      const id = await run("INSERT INTO invoices (client_id,period,currency,net_days,total) VALUES (?,?,?,?,?)", b.client_id, period, b.currency, b.net_days, total);
      for (const l of b.lines)
        await run(`INSERT INTO invoice_lines (invoice_id,project_id,assignment_id,person_id,kind,description,detail,quantity,unit,unit_price,amount)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, l.project_id, l.assignment_id, l.person_id, l.kind, l.description, l.detail, l.quantity, l.unit, l.unit_price, l.amount);
      for (const e of b.entryIds) await run("UPDATE timesheet_entries SET invoice_id=? WHERE id=?", id, e);
      for (const m of b.milestoneIds) await run("UPDATE milestones SET invoice_id=? WHERE id=?", id, m);
      invoiceIds.push(id);
    }
    return { invoiceIds, warnings };
  });
}

export async function issueInvoice(id: number, today = new Date().toISOString().slice(0, 10)): Promise<string> {
  return await tx(async () => {
    const inv = await get<{ status: string; net_days: number; number: string | null }>("SELECT status,net_days,number FROM invoices WHERE id=?", id);
    if (!inv || inv.status !== "draft") throw new Error("Only draft invoices can be issued");
    const year = today.slice(0, 4);
    const last = (await get<{ n: string }>("SELECT MAX(number) AS n FROM invoices WHERE number LIKE ?", `${year}-%`))?.n;
    const number = `${year}-${String((last ? Number(last.split("-")[1]) : 0) + 1).padStart(4, "0")}`;
    const due = new Date(today + "T00:00:00Z");
    due.setUTCDate(due.getUTCDate() + inv.net_days);
    await run("UPDATE invoices SET status='issued', number=?, issue_date=?, due_date=? WHERE id=?", number, today, due.toISOString().slice(0, 10), id);
    return number;
  });
}

/** Voiding releases the underlying hours/milestones so they can be invoiced again. */
export async function voidInvoice(id: number) {
  await tx(async () => {
    const inv = await get<{ status: string }>("SELECT status FROM invoices WHERE id=?", id);
    if (!inv || inv.status === "paid" || inv.status === "void") throw new Error("Paid or void invoices cannot be voided");
    await run("UPDATE timesheet_entries SET invoice_id=NULL WHERE invoice_id=?", id);
    await run("UPDATE milestones SET invoice_id=NULL WHERE invoice_id=?", id);
    if (inv.status === "draft") await run("DELETE FROM invoices WHERE id=?", id);
    else await run("UPDATE invoices SET status='void' WHERE id=?", id);
  });
}

// ---------------------------------------------------------------- payouts

interface PayLine {
  project_id: number; assignment_id: number; kind: string; description: string;
  quantity: number; unit: string; unit_price: number; amount: number;
}
interface PayBucket { person_id: number; currency: string; type: "internal" | "external"; lines: PayLine[]; entryIds: number[]; milestoneIds: number[] }

/**
 * Pay/cost per worker: external people -> contractor payout (they invoice us),
 * internal people -> payroll cost allocation. A substitute is paid at the cost
 * rate set on the substitution; internal substitutes need none (payroll).
 */
export async function generatePayouts(period: string): Promise<{ payoutIds: number[]; warnings: string[] }> {
  const { end } = periodRange(period);
  const warnings: string[] = [];
  return await tx(async () => {
    for (const d of await all<{ id: number }>("SELECT id FROM payouts WHERE period=? AND status='draft'", period)) {
      await run("UPDATE timesheet_entries SET payout_id=NULL WHERE payout_id=?", d.id);
      await run("UPDATE milestones SET payout_id=NULL WHERE payout_id=?", d.id);
      await run("DELETE FROM payouts WHERE id=?", d.id);
    }
    const buckets = new Map<string, PayBucket>();
    const bucketFor = (personId: number, type: "internal" | "external", currency: string) => {
      const key = `${personId}|${currency}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { person_id: personId, currency, type, lines: [], entryIds: [], milestoneIds: [] }));
      return b;
    };
    const types = new Map((await all<{ id: number; worker_type: "internal" | "external" }>("SELECT id,worker_type FROM people")).map((p) => [p.id, p.worker_type]));
    const names = new Map((await all<{ id: number; name: string }>("SELECT id,name FROM people")).map((p) => [p.id, p.name]));

    for (const a of await all<AssignmentRow>(ASSIGNMENTS_SQL)) {
      const rates = await ratesOf(a.id);
      if (a.billing_type === "hourly" || a.billing_type === "daily") {
        const subs = await all<{ person_id: number; from_date: string; to_date: string; cost_amount: number | null; cost_currency: string }>(
          "SELECT person_id,from_date,to_date,cost_amount,cost_currency FROM substitutions WHERE assignment_id=?", a.id);
        const costFor = (e: { work_date: string; worker_id: number }) => {
          if (e.worker_id === a.person_id) return rateAt(rates, "cost", e.work_date);
          const s = subs.find((s) => s.person_id === e.worker_id && s.from_date <= e.work_date && e.work_date <= s.to_date && s.cost_amount != null);
          return s ? { amount: s.cost_amount!, currency: s.cost_currency } : undefined;
        };
        const pending = await all<EntryRow>(
          `SELECT t.id,t.work_date,t.hours,t.worker_id,w.name AS worker_name FROM timesheet_entries t
           JOIN people w ON w.id=t.worker_id WHERE t.assignment_id=? AND t.status='approved' AND t.work_date<=? AND t.payout_id IS NULL
           ORDER BY t.work_date`, a.id, end);
        const byWorker = new Map<number, EntryRow[]>();
        for (const e of pending) byWorker.set(e.worker_id, [...(byWorker.get(e.worker_id) ?? []), e]);
        for (const [workerId, list] of byWorker) {
          const type = types.get(workerId) ?? "external";
          const priced = priceEntries(a.billing_type, a.hours_per_day, list, costFor);
          if (priced.missing.length && type === "external")
            warnings.push(`${a.project_name} / ${names.get(workerId)}: ${priced.missing.length} approved entr${priced.missing.length > 1 ? "ies" : "y"} without a cost rate were not included in the payout.`);
          const missingIds = new Set(priced.missing.map((m) => m.id));
          for (const line of priced.lines) {
            const b = bucketFor(workerId, type, line.currency);
            b.lines.push({
              project_id: a.project_id, assignment_id: a.id, kind: a.billing_type,
              description: `${a.project_name}${monthTag(line.month, period)}${workerId !== a.person_id ? ` (substituting ${a.person_name})` : ""}`,
              quantity: line.quantity, unit: line.unit, unit_price: line.unit_price, amount: line.amount,
            });
          }
          for (const e of list) {
            if (missingIds.has(e.id)) continue;
            const r = costFor(e)!;
            bucketFor(workerId, type, r.currency).entryIds.push(e.id);
          }
        }
      } else if (a.billing_type === "monthly") {
        const done = await get(
          `SELECT 1 FROM payout_lines l JOIN payouts p ON p.id=l.payout_id
           WHERE l.assignment_id=? AND l.kind='monthly' AND p.period=?`, a.id, period);
        if (done) continue;
        const rate = rateAt(rates, "cost", end);
        const fraction = monthFraction(a.start_date, a.end_date, period);
        if (!rate || fraction <= 0) continue;
        bucketFor(a.person_id, a.person_type, rate.currency).lines.push({
          project_id: a.project_id, assignment_id: a.id, kind: "monthly",
          description: `${a.project_name} (monthly${fraction < 1 ? ", prorated" : ""})`,
          quantity: Math.round(fraction * 10000) / 10000, unit: "month", unit_price: rate.amount, amount: round2(rate.amount * fraction),
        });
      } else {
        for (const m of await all<MilestoneRow>(
          "SELECT * FROM milestones WHERE assignment_id=? AND status='approved' AND payout_id IS NULL AND approved_on<=? AND cost_amount>0", a.id, end)) {
          const b = bucketFor(a.person_id, a.person_type, m.cost_currency);
          b.lines.push({
            project_id: a.project_id, assignment_id: a.id, kind: "milestone", description: `${a.project_name} - ${m.title}`,
            quantity: 1, unit: "fixed", unit_price: m.cost_amount, amount: m.cost_amount,
          });
          b.milestoneIds.push(m.id);
        }
      }
    }

    const payoutIds: number[] = [];
    for (const b of buckets.values()) {
      if (!b.lines.length) continue;
      const total = round2(b.lines.reduce((s, l) => s + l.amount, 0));
      const id = await run("INSERT INTO payouts (person_id,period,currency,kind,total) VALUES (?,?,?,?,?)", b.person_id, period, b.currency, b.type === "internal" ? "payroll" : "contractor", total);
      for (const l of b.lines)
        await run(`INSERT INTO payout_lines (payout_id,project_id,assignment_id,kind,description,quantity,unit,unit_price,amount) VALUES (?,?,?,?,?,?,?,?,?)`,
          id, l.project_id, l.assignment_id, l.kind, l.description, l.quantity, l.unit, l.unit_price, l.amount);
      for (const e of b.entryIds) await run("UPDATE timesheet_entries SET payout_id=? WHERE id=?", id, e);
      for (const m of b.milestoneIds) await run("UPDATE milestones SET payout_id=? WHERE id=?", id, m);
      payoutIds.push(id);
    }
    return { payoutIds, warnings };
  });
}

// ---------------------------------------------------------------- margin

export async function fxRate(currency: string, date: string): Promise<number | undefined> {
  if (currency === "EUR") return 1;
  return (await get<{ rate_to_eur: number }>("SELECT rate_to_eur FROM fx_rates WHERE currency=? AND as_of<=? ORDER BY as_of DESC LIMIT 1", currency, date))?.rate_to_eur;
}

export interface MarginRow { assignment_id: number; project: string; person: string; revenue: number; cost: number; margin: number }

/** Revenue (non-void invoices) minus cost (payouts) for a period, in EUR, per assignment. */
export async function marginReport(period: string): Promise<{ rows: MarginRow[]; revenue: number; cost: number; warnings: string[] }> {
  const { end } = periodRange(period);
  const warnings: string[] = [];
  const acc = new Map<number, MarginRow>();
  const row = async (assignmentId: number) => {
    let r = acc.get(assignmentId);
    if (!r) {
      const a = (await get<{ project: string; person: string }>(
        "SELECT p.name AS project, per.name AS person FROM assignments a JOIN projects p ON p.id=a.project_id JOIN people per ON per.id=a.person_id WHERE a.id=?", assignmentId))!;
      acc.set(assignmentId, (r = { assignment_id: assignmentId, project: a.project, person: a.person, revenue: 0, cost: 0, margin: 0 }));
    }
    return r;
  };
  const add = async (rows: { assignment_id: number; currency: string; amount: number }[], field: "revenue" | "cost") => {
    for (const x of rows) {
      const eur = toEur(x.amount, x.currency, await fxRate(x.currency, end));
      if (eur === undefined) { warnings.push(`No exchange rate for ${x.currency} on ${end}; amounts excluded.`); continue; }
      (await row(x.assignment_id))[field] += eur;
    }
  };
  await add(await all(`SELECT l.assignment_id, i.currency, l.amount FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id WHERE i.period=? AND i.status<>'void'`, period), "revenue");
  await add(await all(`SELECT l.assignment_id, p.currency, l.amount FROM payout_lines l JOIN payouts p ON p.id=l.payout_id WHERE p.period=?`, period), "cost");
  const rows = [...acc.values()].map((r) => ({ ...r, revenue: round2(r.revenue), cost: round2(r.cost), margin: round2(r.revenue - r.cost) }));
  return {
    rows, warnings: [...new Set(warnings)],
    revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)), cost: round2(rows.reduce((s, r) => s + r.cost, 0)),
  };
}
