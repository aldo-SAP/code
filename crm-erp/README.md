# Talent CRM/ERP

CRM + light ERP for an IT company that trains students and places them with foreign clients
(hourly, daily-rate, monthly or fixed-price), with substitutions, external freelancers,
timesheets, client invoices, payouts and margin.

Next.js 15 + PostgreSQL. In production the database is Supabase Postgres; locally it is an embedded Postgres
(PGlite, no install) stored in `data/pgdata`, so local behaviour matches production. Everything is async SQL through `lib/db.ts`.

- **Go live:** see [DEPLOY.md](DEPLOY.md) (Supabase + Render + Cloudflare + Microsoft, step by step, plus backups and a security checklist).
- **Hosting file:** `../render.yaml` at the repository root; settings in `.env.example`.

## Run locally

```bash
cd crm-erp
npm install
npm run seed:demo      # admin@example.com / changeme123 + sample data (use `npm run seed` for admin only)
npm run dev            # http://localhost:3000
npm test               # unit and integration tests on embedded Postgres
```
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before seeding to choose your own login. To use a real Postgres instead of the embedded one,
set `DATABASE_URL` (and `DATABASE_SSL=off` for a server without SSL). To also run the tests against a real server:
`TEST_DATABASE_URL=postgres://user@host:5432/postgres npm test` (each test file gets its own throwaway database).
For `npm start` over plain HTTP locally set `INSECURE_COOKIES=1`.

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

## Microsoft sign-in (Entra ID)

Staff sign in with their Microsoft work account; freelancers without one keep a password. Each user has a sign-in method: `microsoft`, `password` or `both` (Settings, admin only).

**One-time setup (a Microsoft 365 admin, about 10 minutes)**
1. Entra admin center, **App registrations**, **New registration**. Name it e.g. "Talent CRM". Supported account types: **Single tenant only** (this company's directory).
2. **Redirect URI**: platform **Web**, value `https://YOUR-DOMAIN/auth/microsoft/callback` (for local tests `http://localhost:3000/auth/microsoft/callback`). Settings in the app shows the exact value.
3. **Certificates & secrets**, **New client secret**. Copy the secret *value* now. It expires (max 24 months): put a reminder in your calendar.
4. From the **Overview** page copy **Directory (tenant) ID** and **Application (client) ID**.
5. Set these on the server (never commit them): `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `APP_URL=https://YOUR-DOMAIN`. Restart.
6. In the app, create each staff user with sign-in **Microsoft** and the same email as their Microsoft account. The first Microsoft sign-in links their Microsoft account id; later logins match on that id.

**Security properties**
- Authorization code flow with PKCE, `state` and `nonce`; the ID token signature (Microsoft's published keys), issuer (your tenant), audience (this app), expiry and tenant id are all verified. Forged, replayed, expired or other-tenant tokens are rejected (see `tests/msauth.test.ts`).
- Nobody is created automatically: a valid Microsoft account that an admin has not added gets "No access". Deactivating a user, or disabling them in Microsoft, locks them out.
- Your MFA and conditional-access policies apply automatically; the app never sees a Microsoft password.
- Password sign-in: scrypt hashes, signed httpOnly cookies, and 5 failed attempts per email lock password login for 15 minutes. Every attempt is in the audit log.
- Keep your own admin on `both` so a Microsoft misconfiguration or an expired client secret cannot lock you out.

## Security measures built in
- Database: row-level security with no policies on every table (public API roles read nothing); the audit log is append-only (edit, delete and truncate are blocked by triggers).
- Web: CSP, HSTS, no framing, `nosniff`, no caching of pages, server actions restricted to your own domain.
- Sessions: signed httpOnly cookies; 8 hours for admins, 12 for managers, 7 days for workers.
- Sign-in: Microsoft (staff), passwords with 5-attempt lockout (freelancers), IP and country on every audit entry, a `login_new_country` alert, failed attempts logged.
- Not yet built: authenticator-app codes (TOTP) for password users.

### Known limits (v1)
- No VAT (amounts only, as requested). Invoices print to PDF from the browser or export as CSV.
- Substitution on a **monthly** or **fixed** assignment is not priced; substitutions apply to hourly/daily work.
- Cost rates do not apply to leave; leave is informational and non-billable.
