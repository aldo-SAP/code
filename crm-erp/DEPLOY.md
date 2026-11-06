# Going live: Supabase + Render + Cloudflare (about 1 hour, no coding)

Prices are approximate; check them when you sign up. Expect about $32 a month (Supabase Pro about $25, Render Starter about $7).

**Before you start**
- Use a company email, not a personal one, for every account below.
- Turn on two-factor authentication on each one, and add a second owner so you are not a single point of failure.
- Never paste secrets into chat, email or the code. They only go into the dashboards named below.

---

## 1. Database: Supabase (region Frankfurt)

1. Create an organisation, then a **new project**. Region: **Europe (Frankfurt)**. Plan: **Pro**. Choose a long random database password and store it in your password manager.
2. **Project Settings, Data API**: switch the Data API **off**. The app talks to the database directly; nothing needs the public API.
3. **Project Settings, Database, Network restrictions**: once Render is running (step 2) add Render's outbound IP addresses here so only the app server can connect. (Render shows them under the service's *Connect* menu.)
4. **Project Settings, Database, SSL**: enforce SSL connections.
5. Click **Connect** at the top of the project and copy the **Session pooler** connection string (it works over IPv4, which Render needs). Replace `[YOUR-PASSWORD]` in it with your database password. This whole string is `DATABASE_URL`.
6. **Database, Backups**: confirm daily backups are listed. If you want to restore to any minute, enable the Point-in-Time Recovery add-on (extra cost; optional).

The app creates its tables the first time it starts. It also turns on row-level security with no policies, so even if the Data API were switched on, nobody could read the tables through it.

## 2. App: Render (region Frankfurt)

1. Create a Render account, connect GitHub, and choose **New, Blueprint**. Pick this repository: the file `render.yaml` at its root sets up the service (Frankfurt, Starter plan, always on).
   Doing it by hand instead: **New, Web Service**, root directory `crm-erp`, build `npm ci && npm run build`, start `npm start`, health check path `/healthz`, region Frankfurt, plan Starter.
2. When asked for the secret values, enter:

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://crm.yourcompany.com` (your final address, no trailing slash) |
   | `DATABASE_URL` | the Supabase session pooler string from step 1 |
   | `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | from step 4 below |
   | `BOOTSTRAP_ADMIN_EMAIL` | your Microsoft work email (becomes the first admin) |
   | `BOOTSTRAP_ADMIN_NAME` | your name |
   | `MAIL_PROVIDER`, `MAIL_SENDER` (or `RESEND_API_KEY`, `MAIL_FROM`) | from step 5 |

   `APP_SECRET` is generated for you. Do **not** set `BOOTSTRAP_ADMIN_PASSWORD` unless you want a password login for that first admin as a break-glass account (recommended: set a long one, store it in the password manager).
3. Wait for the first deploy to finish. Open `https://<service>.onrender.com/healthz`: it should say `ok`.

## 3. Your domain and Cloudflare

1. In Render, service **Settings, Custom Domains**, add `crm.yourcompany.com`. Render shows a DNS record to create.
2. Recommended: put the domain on **Cloudflare** (free plan): add the site, switch your registrar's nameservers to the two Cloudflare gives you, then create the record Render asked for (type CNAME, name `crm`). Turn the orange cloud (proxy) **on**.
3. Cloudflare settings: SSL/TLS mode **Full (strict)**; **Always use HTTPS** on; Security, **Bot Fight Mode** on; add a **rate-limiting rule** for the path `/login` and `/auth/microsoft` (for example 20 requests per minute per IP).
4. Optional: a WAF rule that blocks countries your team and freelancers never work from. This is a weak extra layer (VPNs get around it) and will block legitimate people travelling, so skip it if unsure.
5. Back in Supabase, finish the network restriction from step 1.3. With Cloudflare in front, sign-ins in the audit log also record the visitor's country.

## 4. Microsoft sign-in (a Microsoft 365 admin, about 10 minutes)

1. Entra admin center, **App registrations, New registration**. Name: "Talent CRM". Supported account types: **Single tenant only**.
2. Redirect URI: platform **Web**, value `https://crm.yourcompany.com/auth/microsoft/callback`.
3. **Certificates & secrets, New client secret**: copy the **value** now. Set a calendar reminder before it expires (max 24 months).
4. From **Overview** copy the Directory (tenant) ID and Application (client) ID.
5. Put the three values in Render (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`) and redeploy.
6. Optional but recommended: in Entra **Conditional Access**, require MFA for this app, and optionally limit sign-in to countries you work from (needs Entra ID P1, included in Microsoft 365 Business Premium).

## 5. Email (leave requests and decisions)

Without email the app still works, but nobody is notified. Pick **one** option.

**Option A: Microsoft 365 (recommended, no new vendor).** Uses the same Entra app as sign-in.
1. Create a **shared mailbox** such as `crm@yourcompany.com` (Microsoft 365 admin center, Teams & groups, Shared mailboxes). It needs no licence.
2. Entra app registration, **API permissions, Add a permission, Microsoft Graph, Application permissions, `Mail.Send`**, then **Grant admin consent**.
3. **Important:** by default that permission lets the app send as *anyone* in your company. Restrict it to the one mailbox. An Exchange admin runs (PowerShell, Exchange Online module):
   ```
   New-DistributionGroup -Name "CRM mail sender" -Type Security -Members crm@yourcompany.com   # or use an existing mail-enabled security group
   New-ApplicationAccessPolicy -AppId <Application (client) ID> -PolicyScopeGroupId "CRM mail sender" -AccessRight RestrictAccess -Description "Talent CRM may only send as the crm mailbox"
   Test-ApplicationAccessPolicy -Identity crm@yourcompany.com -AppId <Application (client) ID>   # should say Granted
   ```
   (Microsoft is moving this to "Application RBAC for Exchange Online"; either works as long as the app is limited to that mailbox.)
4. In Render set `MAIL_PROVIDER=graph` and `MAIL_SENDER=crm@yourcompany.com`. The three `MS_*` values are reused.

**Option B: Resend** (a mail service, free for small volumes). Create an account, add and verify your domain (DNS records SPF/DKIM), create an API key, then in Render set `MAIL_PROVIDER=resend`, `RESEND_API_KEY` and `MAIL_FROM=Talent CRM <crm@yourcompany.com>`.

With Microsoft 365 the thread works through the mailbox's Sent Items (replies are real reply-all messages), so do not delete the first message from the shared mailbox's Sent Items; if you do, the next update simply starts a new thread.

Then in the app: **Settings, Email and leave approvals, "Send me a test email"**. Every message, sent or failed, appears in the **Email log** with a Retry button.

**How leave works**
- A worker asks for vacation under *My leave*. Managers and admins (or the list you enter in Settings) get one email with a link, and the worker is in copy. Everything about that request (decision, cancellation, a later withdrawal) is sent as a reply in that same thread.
- The link opens the request (signing in first if needed, then returning to it). The approver sees what the person is working on, any substitute, hours already logged and colleagues off, then approves or rejects. The worker is emailed the decision.
- You cannot decide your own request. Sick days are recorded at once and the approvers are told. Managers can record leave for anyone. Everything is in the audit log.
- Email links never approve anything by themselves: they only open the request, and a signed-in manager has to press the button. That also protects against mail scanners that open links automatically.

## 6. First sign-in and checks

1. Open `https://crm.yourcompany.com`, press **Sign in with Microsoft** with the email you set as `BOOTSTRAP_ADMIN_EMAIL`.
2. **Settings**: enter the company name, address and IBAN (printed on invoices). Add each staff member as a user with sign-in **Microsoft** and the same email as their Microsoft account. Freelancers without Microsoft get **password**.
3. Keep your own admin on **both**, so a Microsoft problem never locks you out. Because that account has a password, protect it: open **My account** and set up an authenticator app, and save the recovery codes somewhere safe (a password manager, not the same phone).
4. **Settings, Authenticator app**: set "Who must use an authenticator" to **Admins and managers** (or **Everyone** if freelancers sign in with passwords). People are then asked to set it up at their next password sign-in. Microsoft sign-ins are not affected.
5. Lost phone: an admin presses **Reset** next to the person in Settings, and they set up a new one. If the only admin is locked out, run `npm run mfa:reset -- admin@company.com` with the production `DATABASE_URL` from a trusted computer.
6. **Test a restore once before relying on it** (see below).

## Backups and restore

- **Automatic:** Supabase takes daily backups (Dashboard, Database, Backups). Restoring is one click there and replaces the live database, so do it only after telling people.
- **Your own copy:** Settings, **Download full data export**. Do it weekly and keep the file outside Supabase/Render (company file storage). It contains all business data except password hashes. Every download is logged.
- **Test:** create a second, free Supabase project, restore the latest backup into it from the dashboard, and look at the data. Delete the project afterwards.
- The export file is JSON and meant for safekeeping and emergency inspection; the Supabase backup is the way to restore.

## Updating the app
Render redeploys automatically whenever the code is pushed to the connected branch. Database changes are applied on startup. Before a big change, download an export first.

## Security checklist
- [ ] 2FA and two owners on Supabase, Render, Cloudflare, GitHub and the domain registrar
- [ ] Supabase Data API off, SSL enforced, network restriction set to Render's IPs
- [ ] Staff on Microsoft sign-in; MFA enforced in Microsoft
- [ ] Secrets only in Render's environment screen
- [ ] Cloudflare proxy on, HTTPS only, rate limit on `/login`
- [ ] Weekly export saved outside the hosting accounts; restore tested once
- [ ] Reminder in the calendar before the Microsoft client secret expires
- [ ] Review the Audit log (Settings area, admin only) now and then for `login_failed`, `login_new_country`, `reopen_billed_hours` and `void`
