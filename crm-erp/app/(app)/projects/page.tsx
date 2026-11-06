import Link from "next/link";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { Badge, Flash } from "@/components/ui";

export default async function Projects({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const rows = await all<any>(`SELECT p.*, c.name AS client, (SELECT COUNT(*) FROM assignments a WHERE a.project_id=p.id) AS people FROM projects p JOIN clients c ON c.id=p.client_id ORDER BY p.status='active' DESC, p.id DESC`);
  return (
    <>
      <h2>Projects</h2><Flash sp={sp} />
      <table><thead><tr><th>Project</th><th>Client</th><th>People</th><th>Status</th></tr></thead><tbody>
        {rows.map((p) => <tr key={p.id}><td><Link href={`/projects/${p.id}`}>{p.name}</Link></td><td><Link href={`/clients/${p.client_id}`}>{p.client}</Link></td><td>{p.people}</td><td><Badge v={p.status} /></td></tr>)}
        {!rows.length && <tr><td colSpan={4} className="muted">No projects. Create one from a client page.</td></tr>}</tbody></table>
    </>
  );
}
