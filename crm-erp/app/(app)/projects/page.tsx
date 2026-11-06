import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { Flash } from "@/components/ui";
import DataTable, { type Row } from "@/components/DataTable";
import PageHead from "@/components/PageHead";

export default async function Projects({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const list = await all<any>(`SELECT p.*, c.name AS client, (SELECT COUNT(*) FROM assignments a WHERE a.project_id=p.id) AS people FROM projects p JOIN clients c ON c.id=p.client_id ORDER BY p.status='active' DESC, p.id DESC`);
  const rows: Row[] = list.map((p) => ({ id: p.id, project: { t: p.name, href: `/projects/${p.id}` }, client: { t: p.client, href: `/clients/${p.client_id}` }, people: Number(p.people), status: { t: p.status, badge: true } }));
  return (
    <>
      <PageHead title="Projects" sub="Create a project from a client's page." />
      <Flash sp={sp} />
      <DataTable rows={rows} empty="No projects yet. Create one from a client page." initialSort={[{ id: "status", desc: false }, { id: "project", desc: false }]}
        cols={[{ key: "project", label: "Project" }, { key: "client", label: "Client", filter: "select" }, { key: "people", label: "People", num: true, filter: "none" }, { key: "status", label: "Status", filter: "select" }]} />
    </>
  );
}
