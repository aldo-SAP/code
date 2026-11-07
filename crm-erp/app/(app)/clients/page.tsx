import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { addClient } from "@/app/actions";
import { CurrencySelect, Field, Flash } from "@/components/ui";
import DataTable, { type Row } from "@/components/DataTable";
import Drawer from "@/components/Drawer";
import PageHead from "@/components/PageHead";

export default async function Clients({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const list = await all<any>(`SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.status='active') AS projects FROM clients c ORDER BY c.name`);
  const rows: Row[] = list.map((c) => ({ id: c.id, name: { t: c.name, href: `/clients/${c.id}`, sub: c.email ?? undefined }, country: c.country, currency: c.currency, projects: Number(c.projects), status: { t: c.status, badge: true } }));
  return (
    <>
      <PageHead title="Clients" sub="Companies you place people with and invoice.">
        <Drawer button="New client" title="New client">
          <form action={addClient}>
            <div className="drawer-fields">
              <Field label="Name" full><input name="name" required /></Field>
              <Field label="Country"><input name="country" /></Field>
              <Field label="Invoice currency"><CurrencySelect /></Field>
              <Field label="Billing email" full><input name="email" type="email" /></Field>
            </div>
            <div className="drawer-actions"><button type="button" className="sec" data-cancel>Cancel</button><button>Save client</button></div>
          </form>
        </Drawer>
      </PageHead>
      <Flash sp={sp} />
      <DataTable rows={rows} empty="No clients yet. Add the first one with New client."
        cols={[{ key: "name", label: "Name" }, { key: "country", label: "Country", filter: "select" }, { key: "currency", label: "Currency", filter: "select" }, { key: "projects", label: "Active projects", num: true, filter: "none" }, { key: "status", label: "Status", filter: "select" }]} />
    </>
  );
}
