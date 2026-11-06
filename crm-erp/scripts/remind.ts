// Send hours reminders from a scheduler:  npm run remind [-- YYYY-MM]   (default: the current month)
import { sendReminders } from "../lib/reminders.ts";
const period = process.argv[2] ?? new Date().toISOString().slice(0, 7);
const r = await sendReminders(period);
console.log(`Reminders for ${period}: sent ${r.sent.length} (${r.sent.join(", ") || "-"}); skipped ${r.skipped.join(", ") || "-"}`);
process.exit(0);
