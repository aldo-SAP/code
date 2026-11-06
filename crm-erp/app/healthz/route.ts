import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Uptime check for the host. Public, reveals nothing except ok / not ok. */
export async function GET() {
  try {
    await get("SELECT 1 AS ok");
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("database unavailable", { status: 503 });
  }
}
