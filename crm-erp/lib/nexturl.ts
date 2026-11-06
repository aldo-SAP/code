/** Only allow same-site relative paths as a post-login destination (no open redirect). */
export function safeNext(v: string | null | undefined): string | null {
  if (!v || !/^\/(?!\/)[\w\-./?=&%~+]*$/.test(v) || /^\/(login|auth)(\/|\?|$)/.test(v) || v.includes("..")) return null;
  return v;
}
