// Break-glass: reset someone's authenticator from the command line (for example when the only admin loses their phone
// and their recovery codes). Needs access to the database, so it is as protected as the database itself.
//   DATABASE_URL=postgres://... npm run mfa:reset -- person@company.com
import { get } from "../lib/db.ts";
import { adminResetMfa } from "../lib/mfa.ts";

const email = (process.argv[2] ?? "").toLowerCase();
if (!email) { console.error("Usage: npm run mfa:reset -- person@company.com"); process.exit(1); }
const u = await get<{ id: number }>("SELECT id FROM users WHERE email=?", email);
if (!u) { console.error(`No user with email ${email}`); process.exit(1); }
await adminResetMfa({ id: null, name: "command line" }, u.id);
console.log(`Authenticator reset for ${email}. They set up a new one at their next password sign-in.`);
process.exit(0);
