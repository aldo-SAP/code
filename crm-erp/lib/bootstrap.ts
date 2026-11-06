import { get, run } from "./db.ts";
import { hashPassword } from "./auth.ts";
import { randomBytes } from "node:crypto";

/**
 * First start on an empty database: create the first admin from environment variables.
 *  BOOTSTRAP_ADMIN_EMAIL (required), BOOTSTRAP_ADMIN_NAME (optional),
 *  BOOTSTRAP_ADMIN_PASSWORD (optional; without it the admin signs in with Microsoft only).
 * Does nothing once any user exists, so it is safe to leave the variables set.
 */
export async function bootstrapAdmin(env = process.env): Promise<boolean> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return false;
  if (await get("SELECT 1 FROM users LIMIT 1")) return false;
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  await run("INSERT INTO users (email,name,password_hash,role,auth_method) VALUES (?,?,?,'admin',?)",
    email, env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin", hashPassword(password || randomBytes(24).toString("hex")), password ? "both" : "microsoft");
  console.log(`Created first admin ${email} (${password ? "password and Microsoft" : "Microsoft only"})`);
  return true;
}
