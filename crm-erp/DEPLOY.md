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

## 5. First sign-in and checks

1. Open `https://crm.yourcompany.com`, press **Sign in with Microsoft** with the email you set as `BOOTSTRAP_ADMIN_EMAIL`.
2. **Settings**: enter the company name, address and IBAN (printed on invoices). Add each staff member as a user with sign-in **Microsoft** and the same email as their Microsoft account. Freelancers without Microsoft get **password**.
3. Keep your own admin on **both**, so a Microsoft problem never locks you out.
4. **Test a restore once before relying on it** (see below).

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
