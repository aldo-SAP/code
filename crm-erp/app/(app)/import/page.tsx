import { requireManager } from "@/lib/session";
import { importCsv } from "@/app/actions";
import { Flash, Hidden } from "@/components/ui";
import PageHead from "@/components/PageHead";

export default async function Import({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const block = (kind: string, title: string, header: string) => (
    <form action={importCsv} className="card" style={{ display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>{title}</h2><Hidden name="kind" value={kind} />
      <code>{header}</code>
      <input type="file" name="file" aria-label={`${title}: CSV file`} accept=".csv,text/csv" />
      <textarea name="text" aria-label={`${title}: paste CSV`} placeholder="...or paste CSV here (first line = header; comma or semicolon separated)" />
      <div><button>Import {kind}</button></div>
    </form>
  );
  return (
    <>
      <PageHead title="CSV import" sub="Bring people, clients and projects in from a spreadsheet." /><Flash sp={sp} />
      <p className="muted">Export from Excel as CSV. Only <b>name</b> is required; unknown columns are ignored. Duplicate client names are skipped.</p>
      {block("clients", "Clients", "name,country,address,email,currency,notes")}
      {block("people", "People", "name,email,phone,country,type(internal|external),stage(applicant|training|ready|placed|alumni),skills,notes")}
    </>
  );
}
