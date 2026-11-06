import { all, get, run } from "./db.ts";

/**
 * Outgoing email. Every message is written to email_outbox first, then sent; a failure never breaks the action that caused it.
 *   MAIL_PROVIDER=graph   Microsoft 365 (Graph sendMail) using the same Entra app: needs MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET and MAIL_SENDER (a mailbox)
 *   MAIL_PROVIDER=resend  Resend API: needs RESEND_API_KEY and MAIL_FROM
 * Without a provider, messages are logged as "skipped" (handy for local work).
 */
export type Provider = "graph" | "resend" | "none";
type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

export function mailProvider(env: Env = process.env): Provider {
  if (env.MAIL_PROVIDER === "graph" && env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.MAIL_SENDER) return "graph";
  if (env.MAIL_PROVIDER === "resend" && env.RESEND_API_KEY && env.MAIL_FROM) return "resend";
  return "none";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Plain text to simple HTML: paragraphs, line breaks, clickable links. */
export function toHtml(text: string): string {
  const body = esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`).join("");
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1c2430">${body}</div>`;
}

let graphToken: { value: string; exp: number } | undefined;
async function graphAccessToken(env: Env, f: Fetch): Promise<string> {
  if (graphToken && graphToken.exp > Date.now() + 60_000) return graphToken.value;
  const res = await f(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID!, client_secret: env.MS_CLIENT_SECRET!, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Microsoft token request failed (${res.status})`);
  graphToken = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3000) * 1000 };
  return graphToken.value;
}

/** Sends one message. Throws on failure. */
export async function deliver(to: string, subject: string, text: string, env: Env = process.env, f: Fetch = fetch): Promise<void> {
  const provider = mailProvider(env);
  const signal = AbortSignal.timeout(15_000);
  if (provider === "graph") {
    const token = await graphAccessToken(env, f);
    const res = await f(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MAIL_SENDER!)}/sendMail`, {
      method: "POST", signal, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: toHtml(text) }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: false }),
    });
    if (res.status !== 202) throw new Error(`Microsoft Graph refused the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
  } else if (provider === "resend") {
    const res = await f("https://api.resend.com/emails", {
      method: "POST", signal, headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html: toHtml(text) }),
    });
    if (!res.ok) throw new Error(`Resend refused the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
  } else {
    throw new Error("skipped");
  }
}

async function attempt(id: number, env: Env, f: Fetch) {
  const m = await get<{ to_addr: string; subject: string; body: string }>("SELECT to_addr,subject,body FROM email_outbox WHERE id=?", id);
  if (!m) return;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  try {
    await deliver(m.to_addr, m.subject, m.body, env, f);
    await run("UPDATE email_outbox SET status='sent', sent_at=?, attempts=attempts+1, error=NULL WHERE id=?", now, id);
  } catch (e) {
    const msg = (e as Error).message;
    await run("UPDATE email_outbox SET status=?, error=?, attempts=attempts+1 WHERE id=?", msg === "skipped" ? "skipped" : "failed", msg === "skipped" ? "No mail provider configured" : msg.slice(0, 400), id);
  }
}

/** Queue and send. Never throws. Duplicate recipients are removed. */
export async function sendMail(to: string[], subject: string, text: string, related?: string, env: Env = process.env, f: Fetch = fetch) {
  for (const addr of [...new Set(to.map((a) => a.trim().toLowerCase()).filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)))]) {
    try {
      const id = await run("INSERT INTO email_outbox (to_addr,subject,body,related) VALUES (?,?,?,?)", addr, subject, text, related ?? null);
      await attempt(id, env, f);
    } catch (e) {
      console.error("mail failed:", (e as Error).message);
    }
  }
}

export async function retryMail(id: number, env: Env = process.env, f: Fetch = fetch) {
  await attempt(id, env, f);
}
export const recentMail = (limit = 30) => all<any>("SELECT * FROM email_outbox ORDER BY id DESC LIMIT ?", limit);
