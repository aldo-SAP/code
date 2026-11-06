import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { can } from "@/lib/auth";
import { addContract, enroll, updatePerson, updateEnrollment } from "@/app/actions";
import LeaveTimeline from "@/components/LeaveTimeline";
import { COUNTRY_CODES, countryName } from "@/lib/holidays";
import { allowanceFor } from "@/lib/leave";
import { setAllowanceAction } from "@/app/actions";
import { Badge, CurrencySelect, Field, Flash, Hidden } from "@/components/ui";
import { fmtRange, fmtSpan } from "@/lib/dates";

const STAGES = ["applicant", "training", "ready", "placed", "alumni"];
export default async function Person({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; year?: string }> }) {
  const user = await requireManager();
  const { id } = await params; const sp = await searchParams;
  const p = await get<any>("SELECT * FROM people WHERE id=?", Number(id));
  if (!p) notFound();
  const back = `/people/${p.id}`;
  const enrollments = await all<any>("SELECT e.*, c.name AS course FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE person_id=?", p.id);
  const courses = await all<any>("SELECT id,name FROM courses ORDER BY id DESC");
  const assignments = await all<any>(`SELECT a.*, pr.name AS project, cl.name AS client FROM assignments a JOIN projects pr ON pr.id=a.project_id JOIN clients cl ON cl.id=pr.client_id WHERE a.person_id=? ORDER BY a.start_date DESC`, p.id);
  const subs = await all<any>(`SELECT s.*, pr.name AS project, a.id AS aid FROM substitutions s JOIN assignments a ON a.id=s.assignment_id JOIN projects pr ON pr.id=a.project_id WHERE s.person_id=? ORDER BY s.from_date DESC`, p.id);
  const leaveYear = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : new Date().getFullYear();
  const allowance = await allowanceFor(p.id, leaveYear);
  const contracts = await all<any>("SELECT * FROM contracts WHERE kind='freelancer' AND person_id=? ORDER BY id DESC", p.id);
  const login = await get<any>("SELECT email,role FROM users WHERE person_id=?", p.id);
  return (
    <>
      <h1>{p.name} <Badge v={p.stage} /></h1><Flash sp={sp} />
      {(p.stage === "applicant" || p.stage === "training") && <div className="flash err">Students in training cannot be assigned to projects. Set the stage to "ready" when they finish.</div>}
      <form action={updatePerson} className="row card">
        <Hidden name="rid" value={p.id} />
        <Field label="Name"><input name="name" defaultValue={p.name} required /></Field>
        <Field label="Email"><input name="email" defaultValue={p.email ?? ""} /></Field>
        <Field label="Phone"><input name="phone" defaultValue={p.phone ?? ""} /></Field>
        <Field label="Lives in (country)"><input name="country" defaultValue={p.country ?? ""} /></Field>
        <Field label="Public holidays follow"><select name="holiday_country" defaultValue={p.holiday_country ?? ""}><option value="">None: no public holidays</option>{COUNTRY_CODES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</select></Field>
        <Field label="Type"><select name="worker_type" defaultValue={p.worker_type}><option value="external">external (contractor)</option><option value="internal">internal (payroll)</option></select></Field>
        <Field label="Stage"><select name="stage" defaultValue={p.stage}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Skills"><input name="skills" defaultValue={p.skills ?? ""} /></Field>
        <Field label="Notes"><input name="notes" defaultValue={p.notes ?? ""} /></Field>
        <button>Save</button>
      </form>
      <p className="muted">{login ? `Login: ${login.email} (${login.role})` : "No login yet. Admins can create one under Settings."}</p>

      <h2>Training</h2>
      <table><thead><tr><th>Course</th><th>Status</th><th>Progress</th><th></th></tr></thead><tbody>
        {enrollments.map((e) => <tr key={e.id}><td>{e.course}</td><td><Badge v={e.status} /></td><td>{e.progress}%</td><td>
          <form action={updateEnrollment} className="row"><Hidden name="rid" value={e.id} /><Hidden name="_back" value={back} />
            <input name="progress" type="number" defaultValue={e.progress} style={{ width: 64 }} />
            <select name="status" defaultValue={e.status}><option>enrolled</option><option>completed</option><option>dropped</option></select><button className="sec sm">Update</button></form></td></tr>)}
        {!enrollments.length && <tr><td colSpan={4} className="muted">Not enrolled in any course.</td></tr>}</tbody></table>
      <form action={enroll} className="row" style={{ marginTop: 8 }}>
        <Hidden name="person_id" value={p.id} /><Hidden name="_back" value={back} />
        <Field label="Enroll in course"><select name="course_id">{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button className="sec">Enroll</button>
      </form>

      <h2>Assignments</h2>
      <table><thead><tr><th>Project</th><th>Client</th><th>Billing</th><th>Dates</th></tr></thead><tbody>
        {assignments.map((a) => <tr key={a.id}><td><Link href={`/assignments/${a.id}`}>{a.project}</Link></td><td>{a.client}</td><td>{a.billing_type}{a.direct_to_client ? " (direct)" : ""}</td><td>{fmtSpan(a.start_date, a.end_date)}</td></tr>)}
        {subs.map((s) => <tr key={`s${s.id}`}><td><Link href={`/assignments/${s.aid}`}>{s.project}</Link></td><td colSpan={2}>substitute</td><td>{fmtRange(s.from_date, s.to_date)}</td></tr>)}
        {!assignments.length && !subs.length && <tr><td colSpan={4} className="muted">None.</td></tr>}</tbody></table>

      {p.worker_type === "external" && <>
        <h2>Freelancer contracts</h2>
        <table><thead><tr><th>Title</th><th>Period</th><th>Currency</th><th>Terms</th></tr></thead><tbody>
          {contracts.map((k) => <tr key={k.id}><td>{k.title}</td><td>{fmtSpan(k.start_date, k.end_date)}</td><td>{k.currency}</td><td>{k.payment_terms}, net {k.net_days}</td></tr>)}
          {!contracts.length && <tr><td colSpan={4} className="muted">No contract.</td></tr>}</tbody></table>
        {can.finance(user) && <form action={addContract} className="row" style={{ marginTop: 8 }}>
          <Hidden name="kind" value="freelancer" /><Hidden name="person_id" value={p.id} /><Hidden name="_back" value={back} />
          <Field label="Title"><input name="title" required placeholder="Freelance agreement" /></Field>
          <div className="pair"><Field label="Start"><input type="date" name="start_date" /></Field><Field label="End"><input type="date" name="end_date" /></Field></div>
          <Field label="Currency"><CurrencySelect /></Field>
          <Field label="Payment terms"><select name="payment_terms"><option value="monthly">Monthly</option><option value="milestone">Per milestone</option></select></Field>
          <Field label="Net days"><input type="number" name="net_days" defaultValue={30} style={{ width: 70 }} /></Field><button className="sec">Add</button></form>}
      </>}

      <h2>Leave</h2>
      <LeaveTimeline personId={p.id} year={leaveYear} basePath={`/people/${p.id}`} />
      <form action={setAllowanceAction} className="row card" style={{ marginTop: 12 }}>
        <Hidden name="person_id" value={p.id} /><Hidden name="year" value={leaveYear} /><Hidden name="_back" value={`/people/${p.id}?year=${leaveYear}`} />
        <Field label={`Vacation allowance ${leaveYear} (working days)`}><input name="days" type="number" step="0.5" min="0" defaultValue={allowance} style={{ width: 120 }} /></Field>
        <Field label="Note (e.g. carried over)"><input name="note" /></Field>
        <button className="sec">Save allowance</button>
      </form>
      <p><Link href="/leave">Record or approve leave</Link></p>
    </>
  );
}
