import { all, get, run } from "./db.ts";

/**
 * Outgoing email with threads. Every message is written to email_outbox first, then sent; a failure never breaks the action that caused it.
 *   MAIL_PROVIDER=graph   Microsoft 365 (Graph) using the same Entra app: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MAIL_SENDER (a mailbox).
 *                         The first message of a thread is sent from the mailbox; later ones are real "reply all" replies to it, so every mail client threads them.
 *   MAIL_PROVIDER=resend  Resend API: RESEND_API_KEY and MAIL_FROM. Threads use Message-ID / In-Reply-To / References headers and an identical subject
 *                         (best effort: depends on the client honouring those headers).
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

const clean = (list: string[]) => [...new Set(list.map((a) => a.trim().toLowerCase()).filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)))];
const addrs = (list: string[]) => list.map((a) => ({ emailAddress: { address: a } }));

interface Msg { to: string[]; cc: string[]; subject: string; text: string }
interface Thread { thread_key: string; graph_message_id: string | null; root_message_id: string | null; last_message_id: string | null; subject: string }
interface Sent { graph_message_id?: string; root_message_id?: string; last_message_id?: string }

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

async function graphSend(m: Msg, thread: Thread | undefined, env: Env, f: Fetch): Promise<Sent> {
  const token = await graphAccessToken(env, f);
  const user = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MAIL_SENDER!)}`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: 'IdType="ImmutableId"' };
  const signal = AbortSignal.timeout(20_000);
  const body = { contentType: "HTML", content: toHtml(m.text) };

  if (thread?.graph_message_id) {
    // real reply-all to the first message of the thread: same recipients, same conversation
    const res = await f(`${user}/messages/${encodeURIComponent(thread.graph_message_id)}/replyAll`, { method: "POST", signal, headers, body: JSON.stringify({ message: { body } }) });
    if (res.status === 202) return {};
    if (res.status !== 404) throw new Error(`Microsoft Graph refused the reply (${res.status}): ${(await res.text()).slice(0, 200)}`);
    // the original is gone from the mailbox: fall through and start a new thread
  }
  const draft = await f(`${user}/messages`, {
    method: "POST", signal, headers,
    body: JSON.stringify({ subject: m.subject, body, toRecipients: addrs(m.to), ccRecipients: addrs(m.cc) }),
  });
  const d: any = await draft.json().catch(() => ({}));
  if (draft.status !== 201 || !d.id) throw new Error(`Microsoft Graph could not create the message (${draft.status}): ${JSON.stringify(d).slice(0, 200)}`);
  const send = await f(`${user}/messages/${encodeURIComponent(d.id)}/send`, { method: "POST", signal, headers });
  if (send.status !== 202) throw new Error(`Microsoft Graph refused to send (${send.status}): ${(await send.text()).slice(0, 200)}`);
  return { graph_message_id: d.id, root_message_id: d.internetMessageId };
}

const domainOf = (from: string) => (from.match(/@([^>\s]+)/)?.[1] ?? "localhost").toLowerCase();

async function resendSend(m: Msg, thread: Thread | undefined, outboxId: number, env: Env, f: Fetch): Promise<Sent> {
  const messageId = `<crm-${outboxId}-${Date.now().toString(36)}@${domainOf(env.MAIL_FROM!)}>`;
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (thread?.root_message_id) {
    headers["In-Reply-To"] = thread.last_message_id ?? thread.root_message_id;
    headers["References"] = [thread.root_message_id, thread.last_message_id].filter(Boolean).join(" ");
  }
  const res = await f("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: m.to, cc: m.cc.length ? m.cc : undefined, subject: thread?.root_message_id ? `Re: ${m.subject.replace(/^Re:\s*/i, "")}` : m.subject, text: m.text, html: toHtml(m.text), headers }),
  });
  if (!res.ok) throw new Error(`Resend refused the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return { root_message_id: thread?.root_message_id ?? messageId, last_message_id: messageId };
}

/** Sends one stored message. Throws "skipped" without a provider. */
export async function deliver(m: Msg, thread: Thread | undefined, outboxId: number, env: Env = process.env, f: Fetch = fetch): Promise<Sent> {
  const provider = mailProvider(env);
  if (provider === "graph") return graphSend(m, thread, env, f);
  if (provider === "resend") return resendSend(m, thread, outboxId, env, f);
  throw new Error("skipped");
}

async function attempt(id: number, env: Env, f: Fetch) {
  const row = await get<any>("SELECT * FROM email_outbox WHERE id=?", id);
  if (!row) return;
  const thread = row.thread_key ? await get<Thread>("SELECT * FROM email_threads WHERE thread_key=?", row.thread_key) : undefined;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  try {
    const sent = await deliver({ to: row.to_addr.split(","), cc: row.cc_addr ? row.cc_addr.split(",") : [], subject: row.subject, text: row.body }, thread, id, env, f);
    if (row.thread_key) {
      await run(
        `INSERT INTO email_threads (thread_key,provider,subject,graph_message_id,root_message_id,last_message_id,updated_at) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (thread_key) DO UPDATE SET graph_message_id=COALESCE(EXCLUDED.graph_message_id, email_threads.graph_message_id),
           root_message_id=COALESCE(email_threads.root_message_id, EXCLUDED.root_message_id), last_message_id=COALESCE(EXCLUDED.last_message_id, email_threads.last_message_id), updated_at=EXCLUDED.updated_at`,
        row.thread_key, mailProvider(env), thread?.subject ?? row.subject, sent.graph_message_id ?? null, sent.root_message_id ?? null, sent.last_message_id ?? null, now);
    }
    await run("UPDATE email_outbox SET status='sent', sent_at=?, attempts=attempts+1, error=NULL WHERE id=?", now, id);
  } catch (e) {
    const msg = (e as Error).message;
    await run("UPDATE email_outbox SET status=?, error=?, attempts=attempts+1 WHERE id=?", msg === "skipped" ? "skipped" : "failed", msg === "skipped" ? "No mail provider configured" : msg.slice(0, 400), id);
  }
}

export interface Outgoing { to: string[]; cc?: string[]; subject: string; text: string; thread?: string; related?: string }

/** Queue and send one message (to everyone in `to`, copy to `cc`). Never throws. `thread` groups messages into one conversation. */
export async function sendMail(o: Outgoing, env: Env = process.env, f: Fetch = fetch) {
  const to = clean(o.to);
  const cc = clean(o.cc ?? []).filter((a) => !to.includes(a));
  if (!to.length) return;
  try {
    const id = await run("INSERT INTO email_outbox (to_addr,cc_addr,subject,body,related,thread_key) VALUES (?,?,?,?,?,?)", to.join(","), cc.join(",") || null, o.subject, o.text, o.related ?? null, o.thread ?? null);
    await attempt(id, env, f);
  } catch (e) {
    console.error("mail failed:", (e as Error).message);
  }
}

export async function retryMail(id: number, env: Env = process.env, f: Fetch = fetch) {
  await attempt(id, env, f);
}
export const recentMail = (limit = 30) => all<any>("SELECT * FROM email_outbox ORDER BY id DESC LIMIT ?", limit);
