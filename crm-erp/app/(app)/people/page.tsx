import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { addPerson } from "@/app/actions";
import { Field, Flash } from "@/components/ui";
import DataTable, { type Row } from "@/components/DataTable";
import Drawer from "@/components/Drawer";
import PageHead from "@/components/PageHead";

const STAGES = ["applicant", "training", "ready", "placed", "alumni"];
export default async function People({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const people = await all<any>("SELECT p.*, (SELECT string_agg(DISTINCT pr.name, ', ') FROM assignments a JOIN projects pr ON pr.id=a.project_id WHERE a.person_id=p.id AND (a.end_date IS NULL OR a.end_date>=to_char(current_date,'YYYY-MM-DD'))) AS projects FROM people p ORDER BY p.name");
  const rows: Row[] = people.map((p) => ({ id: p.id, name: { t: p.name, href: `/people/${p.id}`, sub: p.email ?? undefined }, type: p.worker_type, stage: { t: p.stage, badge: true }, country: p.country, skills: p.skills, project: p.projects }));
  return (
    <>
      <PageHead title="People" sub="Applicants, students and everyone who can be placed with a client.">
        <Drawer button="New person" title="New person">
          <form action={addPerson}>
            <div className="drawer-fields">
              <Field label="Name" full><input name="name" required /></Field>
              <Field label="Email" full><input name="email" type="email" /></Field>
              <Field label="Country"><input name="country" /></Field>
              <Field label="Type"><select name="worker_type"><option value="external">external (contractor)</option><option value="internal">internal (payroll)</option></select></Field>
              <Field label="Stage" full><select name="stage">{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Skills" full><input name="skills" placeholder="java, react" /></Field>
            </div>
            <div className="drawer-actions"><button type="button" className="sec" data-cancel>Cancel</button><button>Save person</button></div>
          </form>
        </Drawer>
      </PageHead>
      <Flash sp={sp} />
      <DataTable rows={rows} tabs={{ key: "stage", values: STAGES }} empty="No people yet. Add the first one with New person."
        cols={[{ key: "name", label: "Name" }, { key: "type", label: "Type", filter: "select" }, { key: "stage", label: "Stage", filter: "select" }, { key: "country", label: "Country", filter: "select", phoneHidden: true }, { key: "skills", label: "Skills", phoneHidden: true }, { key: "project", label: "On project", phoneHidden: true }]} />
    </>
  );
}
