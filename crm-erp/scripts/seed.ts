// Usage: npm run seed   (creates an admin login; add --demo for sample data)
import { run, get, tx } from "../lib/db.ts";
import { hashPassword } from "../lib/auth.ts";

const demo = process.argv.includes("--demo");
const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.ADMIN_PASSWORD ?? "changeme123";

if (!get("SELECT 1 FROM users WHERE email=?", email)) {
  run("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'admin')", email, "Admin", hashPassword(password));
  console.log(`Admin created: ${email} / ${password}  (change it under Settings)`);
}
run("INSERT OR IGNORE INTO settings (key,value) VALUES ('company_name','My IT Company')");

if (demo && !get("SELECT 1 FROM clients")) {
  tx(() => {
    const month = new Date().toISOString().slice(0, 7);
    const d = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
    const client = run("INSERT INTO clients (name,country,currency,email) VALUES ('Acme GmbH','Germany','EUR','ap@acme.example')");
    run("INSERT INTO contacts (client_id,name,email,role) VALUES (?,?,?,?)", client, "Anna Weber", "anna@acme.example", "Head of Engineering");
    const project = run("INSERT INTO projects (client_id,name,start_date) VALUES (?,'Customer Portal','2026-01-01')", client);
    const person = (n: string, type: string, stage = "ready") => run("INSERT INTO people (name,worker_type,stage,skills,country) VALUES (?,?,?,?,?)", n, type, stage, "react, node", "Albania");
    const x = person("Xhulio (external)", "external", "placed"), y = person("Yll (external)", "external"), z = person("Zana (internal)", "internal", "placed");
    person("Student One", "external", "training");
    const course = run("INSERT INTO courses (name,start_date) VALUES ('Full-stack bootcamp 2026','2026-09-01')");
    run("INSERT INTO enrollments (person_id,course_id,progress) VALUES (?,?,40)", get<any>("SELECT id FROM people WHERE name='Student One'")!.id, course);
    const contract = (title: string) => run("INSERT INTO contracts (kind,client_id,title,start_date,net_days) VALUES ('client',?,?,'2026-01-01',30)", client, title);
    const a1 = run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date,role_title) VALUES (?,?,?,'daily','2026-01-01','Backend')", project, contract("Xhulio - Portal"), x);
    run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'bill',420,'2026-01-01')", a1);
    run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'cost',260,'2026-01-01')", a1);
    run("INSERT INTO substitutions (assignment_id,person_id,from_date,to_date,cost_amount,reason) VALUES (?,?,?,?,200,'vacation')", a1, y, d(15), d(19));
    const a2 = run("INSERT INTO assignments (project_id,client_contract_id,person_id,billing_type,start_date,role_title) VALUES (?,?,?,'monthly','2026-01-01','Tech lead')", project, contract("Zana - Portal"), z);
    run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'bill',5200,'2026-01-01')", a2);
    run("INSERT INTO rates (assignment_id,kind,amount,effective_from) VALUES (?,'cost',3000,'2026-01-01')", a2);
    run("INSERT INTO deals (title,client_id,stage,value) VALUES ('Mobile app team',?,'proposal',60000)", client);
    run("INSERT INTO deals (title,company_name,stage,value) VALUES ('Data platform','Globex','lead',120000)");
    for (const day of [1, 2, 3, 4, 7, 8, 9, 10, 11]) run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,8,'submitted')", a1, x, d(day));
    for (const day of [15, 16, 17]) run("INSERT INTO timesheet_entries (assignment_id,worker_id,work_date,hours,status) VALUES (?,?,?,8,'submitted')", a1, y, d(day));
  });
  console.log("Demo data created.");
}
