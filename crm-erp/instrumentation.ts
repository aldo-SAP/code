export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapAdmin } = await import("./lib/bootstrap");
    try { await bootstrapAdmin(); } catch (e) { console.error("Admin bootstrap failed:", (e as Error).message); }
  }
}
