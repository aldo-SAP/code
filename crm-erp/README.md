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

### Leave
- Workers request vacation (and "other") under *My leave*; managers/admins approve or reject with a note (required to reject) and cannot decide their own request. Sick days are recorded at once and approvers are told. Public holidays and leave for others are recorded by managers (approved at once).
- **One email thread per request.** The request goes **To the managers, Cc the employee**. The approver opens the link, decides on the web, and the decision arrives as a **reply in the same thread**. Cancellations and withdrawals reply in the same thread too. With Microsoft 365 these are real "reply all" messages sent from the shared mailbox, so Outlook and every other client group them. With Resend the same subject plus `Message-ID`/`In-Reply-To`/`References` headers are used (best effort).
- **Withdrawing approved leave** (project needs): a manager opens the request, enters a reason and withdraws the approval. The days return to the employee's allowance and the thread is updated. Only leave that has not started; the employee can still cancel their own leave.
- **Allowance and timeline:** each person has a yearly vacation allowance (company default in Settings, 22 days if unset; override per person and year, e.g. for carry-over). Employees see days left this year (taken, planned, waiting for approval), a 12-month timeline of when leave was or will be taken, and a history list including rejected and withdrawn items. Managers see everyone's balances, and a warning when a request exceeds what is left.
- The approver page shows assignments, substitutes, hours already logged and colleagues off in the period. Overlapping requests and weekend-only ranges are refused. Only approved leave shades the timesheet.
- Email goes through Microsoft 365 (Graph) or Resend; every message is kept in an email log with retry. Without a provider, messages are logged as "skipped". Setup: DEPLOY.md.
- Not included: automatic substitutes, pro-rata allowance for people who start mid-year (set the number by hand), half days.

### Public holidays (admin page: Public holidays)
- An admin keeps one calendar per country (add a day, paste a whole year as "date name" lines, or copy last year's fixed dates forward). Nothing is pre-filled: official lists change and some dates move (Easter, religious holidays), so the calendar is yours to enter.
- Each person has **Public holidays follow** on their person page, separate from where they live. Someone living in Albania can follow Italy. No country means no public holidays.
- A person's own public holidays are not counted as vacation: leave requests, the days-left numbers and the stored day counts all skip them, and counts update automatically when a calendar or a person's country changes. A request that only covers weekends and holidays is refused.
- They are shown as hatched days on the timesheet, small marks on the leave timeline and "H" cells on the team calendar. Hours can still be logged on them.

### Phone and theme
- Works on phones: top bar with a menu, forms and tables fit the screen (tables scroll sideways inside their own box), 16px inputs so iOS does not zoom. It can be added to the home screen (web app manifest and icons).
- Light and dark follow the device setting by default (`prefers-color-scheme`). The Auto / Light / Dark switch in the menu overrides it and is remembered (cookie), applied on the server so there is no flash.

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
- **Authenticator app (TOTP) for password sign-ins:** standard 6-digit codes (Microsoft Authenticator, Google Authenticator, 1Password...), checked with one step of clock drift, never accepted twice. The secret is stored encrypted (AES-256-GCM, key derived from `APP_SECRET`); ten one-time recovery codes are stored only as keyed hashes. Wrong codes count towards the same 5-failures-in-15-minutes lock as passwords. People set it up on *My account*; Settings lets an admin require it for nobody / admins and managers / everyone with a password, and reset someone's authenticator (lost phone). Every enable, disable, reset and recovery-code use is in the audit log. Microsoft sign-ins use Microsoft's MFA instead.
- If the only admin loses their phone and recovery codes: `DATABASE_URL=... npm run mfa:reset -- admin@company.com` (needs database access).

### Known limits (v1)
- No VAT (amounts only, as requested). Invoices print to PDF from the browser or export as CSV.
- Substitution on a **monthly** or **fixed** assignment is not priced; substitutions apply to hourly/daily work.
- Cost rates do not apply to leave; leave is informational and non-billable.
