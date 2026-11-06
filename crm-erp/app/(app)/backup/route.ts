import { all } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABLES = ["people", "clients", "contacts", "deals", "courses", "enrollments", "contracts", "projects", "assignments", "rates",
  "substitutions", "milestones", "timesheet_entries", "leave", "invoices", "invoice_lines", "payouts", "payout_lines", "fx_rates", "settings", "audit_log"];

/** Admin-only full export as JSON (no password hashes). A second copy next to the host's own backups. */
export async function GET() {
  const u = await currentUser();
  if (!u || !can.admin(u)) return new Response("Forbidden", { status: 403 });
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await all(`SELECT * FROM ${t} ORDER BY 1`);
  data.users = await all("SELECT id,email,name,role,person_id,active,auth_method FROM users ORDER BY id");
  await audit(u, "backup_download", "system", null, "Downloaded a full data export");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), tables: data }, null, 1), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="crm-backup-${stamp}.json"` },
  });
}
