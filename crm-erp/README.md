# Talent CRM/ERP

CRM + light ERP for an IT company that trains students and places them with foreign clients
(hourly, daily-rate, monthly or fixed-price), with substitutions, external freelancers,
timesheets, client invoices, payouts and margin.

Next.js 15 + SQLite (Node's built-in `node:sqlite`, so Node >= 22.13 and no native modules).
Data lives in `data/app.db` (git-ignored).

## Run locally

```bash
cd crm-erp
npm install
npm run seed:demo      # admin@example.com / changeme123 + sample data (use `npm run seed` for admin only)
npm run dev            # http://localhost:3000
npm test               # billing and invoicing tests
```
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before seeding to choose your own login. For `npm start` over plain HTTP
(no TLS) set `INSECURE_COOKIES=1`.

## How it models your business

| Concept | Where |
|---|---|
| Clients, contacts, client contracts (monthly vs per-milestone, net days). **One client contract = one person** (internal or external), created together with that person's assignment, so a contract is never empty | Clients |
| Leads / deals pipeline | Pipeline |
| Students: applicant, training, ready, placed, alumni; courses (free) | People, Training |
| Project = shared work for a client; it can have many people, each on their own contract (contract and assignment are 1:1) | Projects |
| Billing type per assignment: **daily** (hours / 8 x rate), **hourly**, **monthly** fee, **fixed** (milestones) | Assignment |
| **Bill rate** (client pays) and **cost rate** (we pay), effective-dated | Assignment |
| **Substitution**: Y works instead of X for a date range | Assignment |
| Freelancers: a client contract plus a freelancer contract; flag "works directly with client" | People, Projects |
| Timesheets by day, leave (non-billable), manager approval | Timesheets, Approvals |
| Monthly client invoices, payout statements, margin | Invoices, Payouts, Margin |

### Rules worth knowing
- **Students cannot be assigned.** Only people in stage `ready` or `placed` can join a project or substitute.
- **Substitution**: Y logs hours on X's assignment (only inside the substitution dates). The client invoice shows **X only**, with Y's hours added to X's line at X's bill rate (internal-only note: "Includes 16h by Y"). Y is paid at the cost rate set on the substitution. Internal substitutes are payroll and need no cost rate.
- **Only approved hours are billed**, once. Regenerating a month rebuilds drafts only. Issued invoices are never touched; voiding one releases its hours for re-invoicing.
- **Rate changes** apply from their effective date; past months keep their rate.
- **Milestones**: billed after approval. If the client contract is "per milestone", each milestone gets its own invoice, otherwise it joins the monthly invoice.
- **External people** get contractor statements (they invoice you); **internal people** get payroll cost lines.
- Invoice numbers are `YYYY-NNNN`, assigned on issue. One invoice per client, currency and month.
- Currencies: amounts keep their own currency; the margin report converts to EUR with the rates in Settings.
- **Roles**: admin (everything), manager (CRM, projects, approvals, invoices; no cost rates, payouts or margin), worker (own timesheet and leave only).

### Protecting history
- **Billed hours are locked.** Once a day is on an invoice or a payout it shows as a dashed cell and cannot be edited, removed or re-approved.
- **Reopening needs three things:** a written reason, typing `REOPEN`, and the right role. Open *Unlock billed hours* (or the link on the timesheet or invoice).
  - Day is on a **draft** invoice/payout: it is rebuilt without the day.
  - Day is on an **issued** invoice or **approved** payout: admin only. The invoice is **voided and kept** (number not reused), then you correct, re-approve and regenerate.
  - **Paid** invoices and paid payouts cannot be reopened at all.
- **Rates and substitutions:** adding or removing a rate that reaches back before already-billed hours needs a reason and a tick. A substitution whose hours are billed cannot be edited or removed.
- **Voiding an issued invoice** needs an admin, a reason and typing `VOID`.
- **Audit log** (admin): every sign-in, create, change, approval, invoice action and unlock with who, when, reason and before/after values. The table is append-only (database triggers block edits and deletes). Each invoice also shows its own history.

### Known limits (v1)
- No VAT (amounts only, as requested). Invoices print to PDF from the browser or export as CSV.
- Substitution on a **monthly** or **fixed** assignment is not priced; substitutions apply to hourly/daily work.
- Cost rates do not apply to leave; leave is informational and non-billable.
- `node:sqlite` is marked experimental in Node 22 but is stable enough for a single-server app; the schema is plain SQL if you later move to Postgres.
