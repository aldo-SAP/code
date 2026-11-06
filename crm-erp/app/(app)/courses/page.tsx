import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { addCourse, enroll } from "@/app/actions";
import { Badge, Field, Flash, Hidden } from "@/components/ui";
import { fmtSpan } from "@/lib/dates";

export default async function Courses({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const courses = await all<any>("SELECT * FROM courses ORDER BY id DESC");
  const enrollments: Record<number, any[]> = {};
  for (const c of courses) enrollments[c.id] = await all<any>("SELECT e.*, p.name FROM enrollments e JOIN people p ON p.id=e.person_id WHERE course_id=? ORDER BY p.name", c.id);
  const people = await all<any>("SELECT id,name FROM people WHERE stage IN ('applicant','training') ORDER BY name");
  return (
    <>
      <h2>Training</h2><Flash sp={sp} />
      {courses.map((c) => {
        const en = enrollments[c.id] ?? [];
        return (
          <div className="card" key={c.id}>
            <b>{c.name}</b> <span className="muted">{fmtSpan(c.start_date, c.end_date)}</span>
            <table style={{ marginTop: 8 }}><tbody>{en.map((e) => <tr key={e.id}><td><Link href={`/people/${e.person_id}`}>{e.name}</Link></td><td><Badge v={e.status} /></td><td className="num">{e.progress}%</td></tr>)}
              {!en.length && <tr><td className="muted">No students enrolled.</td></tr>}</tbody></table>
            <form action={enroll} className="row" style={{ marginTop: 8 }}>
              <Hidden name="course_id" value={c.id} />
              <Field label="Enroll student"><select name="person_id"><option value="">-</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <button className="sec">Enroll</button>
            </form>
          </div>
        );
      })}
      {!courses.length && <p className="muted">No courses yet.</p>}
      <h3>New course</h3>
      <form action={addCourse} className="row card">
        <Field label="Name"><input name="name" required /></Field>
        <div className="pair"><Field label="Start"><input type="date" name="start_date" /></Field><Field label="End"><input type="date" name="end_date" /></Field></div>
        <Field label="Description"><input name="description" /></Field><button>Add course</button>
      </form>
    </>
  );
}
