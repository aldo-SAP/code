import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { addPerson } from "@/app/actions";
import { Badge, Field, Flash } from "@/components/ui";

const STAGES = ["applicant", "training", "ready", "placed", "alumni"];
export default async function People({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; stage?: string; type?: string; q?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const where: string[] = [], args: string[] = [];
  if (sp.stage) { where.push("stage=?"); args.push(sp.stage); }
  if (sp.type) { where.push("worker_type=?"); args.push(sp.type); }
  if (sp.q) { where.push("(name LIKE ? OR skills LIKE ?)"); args.push(`%${sp.q}%`, `%${sp.q}%`); }
  const rows = all<any>(`SELECT * FROM people ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name`, ...args);
  return (
    <>
      <h2>People</h2><Flash sp={sp} />
      <form className="row bar">
        <Field label="Stage"><select name="stage" defaultValue={sp.stage ?? ""}><option value="">All</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Type"><select name="type" defaultValue={sp.type ?? ""}><option value="">All</option><option>internal</option><option>external</option></select></Field>
        <Field label="Search name / skills"><input name="q" defaultValue={sp.q ?? ""} /></Field>
        <button className="sec">Filter</button>
      </form>
      <div className="tw"><table>
        <thead><tr><th>Name</th><th>Type</th><th>Stage</th><th>Country</th><th>Skills</th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.id}><td><Link href={`/people/${p.id}`}>{p.name}</Link></td><td>{p.worker_type}</td><td><Badge v={p.stage} /></td><td>{p.country}</td><td>{p.skills}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="muted">Nobody matches.</td></tr>}</tbody>
      </table></div>
      <h3>Add person</h3>
      <form action={addPerson} className="row card">
        <Field label="Name"><input name="name" required /></Field>
        <Field label="Email"><input name="email" type="email" /></Field>
        <Field label="Country"><input name="country" /></Field>
        <Field label="Type"><select name="worker_type"><option value="external">external (contractor)</option><option value="internal">internal (payroll)</option></select></Field>
        <Field label="Stage"><select name="stage">{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Skills"><input name="skills" placeholder="java, react" /></Field>
        <button>Add</button>
      </form>
    </>
  );
}
