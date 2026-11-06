import { all } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { addDeal, deleteDeal, moveDeal } from "@/app/actions";
import { CurrencySelect, Field, Flash, Hidden, money } from "@/components/ui";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
export default async function Deals({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const deals = await all<any>("SELECT d.*, c.name AS client FROM deals d LEFT JOIN clients c ON c.id=d.client_id ORDER BY d.id DESC");
  const clients = await all<any>("SELECT id,name FROM clients ORDER BY name");
  return (
    <>
      <h1>Pipeline</h1><Flash sp={sp} />
      <div className="kanban">
        {STAGES.map((st) => {
          const col = deals.filter((d) => d.stage === st);
          return (
            <div className="col" key={st}>
              <h2>{st} ({col.length})</h2>
              {col.map((d) => (
                <div className="deal" key={d.id}>
                  <b>{d.title}</b><br /><span className="muted">{d.client ?? d.company_name ?? "-"}</span><br />{money(d.value, d.currency)}
                  <form action={moveDeal} style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <Hidden name="rid" value={d.id} />
                    <select name="stage" aria-label={`Move ${d.title} to stage`} defaultValue={d.stage}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
                    <button className="sec sm">Move</button>
                  </form>
                  <form action={deleteDeal}><Hidden name="rid" value={d.id} /><button className="danger sm" style={{ marginTop: 4 }}>Delete</button></form>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <h2>New deal / lead</h2>
      <form action={addDeal} className="row card">
        <Field label="Title"><input name="title" required /></Field>
        <Field label="Existing client"><select name="client_id"><option value="">- new company -</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Company (if new)"><input name="company_name" /></Field>
        <Field label="Contact"><input name="contact_name" /></Field>
        <Field label="Value" full><input name="value" type="number" step="0.01" style={{ width: 110 }} /></Field>
        <Field label="Currency"><CurrencySelect /></Field>
        <Field label="Stage"><select name="stage">{STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Expected close"><input name="expected_close" type="date" /></Field>
        <button>Add</button>
      </form>
    </>
  );
}
