// Usage: npm run seed   (creates an admin login; add --demo for sample data)
import { run, get, tx } from "../lib/db.ts";
import { hashPassword } from "../lib/auth.ts";

const demo = process.argv.includes("--demo");
const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.ADMIN_PASSWORD ?? "changeme123";

if (!await get("SELECT 1 FROM users WHERE email=?", email)) {
  await run("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'admin')", email, "Admin", hashPassword(password));
  console.log(`Admin created: ${email} / ${password}  (change it under Settings)`);
}
await run("INSERT INTO settings (key,value) VALUES ('company_name','My IT Company') ON CONFLICT DO NOTHING");

if (demo && !await get("SELECT 1 FROM clients")) {
  await tx(async () => {
    const month = new Date().toISOString().slice(0, 7);
    const d = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
    const client = await run("INSERT INTO clients (name,country,currency,email) VALUES ('Acme GmbH','Germany','EUR','ap@acme.example')");
    await run("INSERT INTO contacts (client_id,name,email,role) VALUES (?,?,?,?)", client, "Anna Weber", "anna@acme.example", "Head of Engineering");
    const project = await run("INSERT INTO projects (client_id,name,start_date) VALUES (?,'Customer Portal','2026-01-01')", client);
    const person = (n: string, type: string, stage = "ready") => run("INSERT INTO people (name,worker_type,stage,skills,country) VALUES (?,?,?,?,?)", n, type, stage, "react, node", "Albania");
    const x = await person("Xhulio (external)", "external", "placed"), y = await person("Yll (external)", "external"), z = await person("Zana (internal)", "internal", "placed");
    await person("Student One", "external", "training");
    const course = await run("INSERT INTO courses (name,start_date) VALUES ('Full-stack bootcamp 2026','2026-09-01')");
    await run("INSERT INTO enrollments (person_id,course_id,progress) VALUES (?,?,40)", (await get<any>("SELECT id FROM people WHERE name='Student One'"))!.id, course);
    const contract = (title: string) => run("INSERT INTO contracts (kind,client_id,title,start_date,net_days) VALUES ('client',?,?,'2026-01-01',30)", client, title);
    const a1 = await run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date,role_title) VALUES (?,?,?,'daily','2026-01-01','Backend')", project, await contract("Xhulio - Portal"), x);
    await run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'bill',420,'2026-01-01')", a1);
    await run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'cost',260,'2026-01-01')", a1);
    await run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date,cost_amount,reason) VALUES (?,?,?,?,200,'vacation')", a1, y, d(15), d(19));
    const a2 = await run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date,role_title) VALUES (?,?,?,'monthly','2026-01-01','Tech lead')", project, await contract("Zana - Portal"), z);
    await run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'bill',5200,'2026-01-01')", a2);
    await run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'cost',3000,'2026-01-01')", a2);
    await run("INSERT INTO deals (title,client_id,stage,value) VALUES ('Mobile app team',?,'proposal',60000)", client);
    await run("INSERT INTO deals (title,company_name,stage,value) VALUES ('Data platform','Globex','lead',120000)");
    for (const day of [1, 2, 3, 4, 7, 8, 9, 10, 11]) await run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,8,'submitted')", a1, x, d(day));
    for (const day of [15, 16, 17]) await run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,8,'submitted')", a1, y, d(day));
  });
  console.log("Demo data created.");
}
process.exit(0);
