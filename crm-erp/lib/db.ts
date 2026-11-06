import { SCHEMA } from "./schema.ts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// process.getBuiltinModule keeps bundlers from trying to resolve node:sqlite.
const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
type DB = InstanceType<typeof DatabaseSync>;

const g = globalThis as unknown as { __db?: DB };

export function db(): DB {
  if (!g.__db) {
    const path = process.env.DB_PATH ?? "data/app.db";
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const d = new DatabaseSync(path);
    d.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    d.exec(SCHEMA);
    migrate(d);
    g.__db = d;
  }
  return g.__db;
}

/** Contract <-> assignment is one-to-one: the contract points at its person's assignment. */
function migrate(d: DB) {
  const cols = (t: string) => d.prepare(`PRAGMA table_info(${t})`).all().map((c: any) => c.name as string);
  if (!cols("assignments").includes("client_contract_id")) {
    d.exec("ALTER TABLE assignments ADD COLUMN client_contract_id INTEGER REFERENCES contracts(id)");
    if (cols("projects").includes("client_contract_id"))
      d.exec(`UPDATE assignments SET client_contract_id=(SELECT client_contract_id FROM projects WHERE projects.id=assignments.project_id)
              WHERE id IN (SELECT MIN(a.id) FROM assignments a JOIN projects p ON p.id=a.project_id WHERE p.client_contract_id IS NOT NULL GROUP BY p.client_contract_id)`);
  }
  d.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_assignment_contract ON assignments(client_contract_id) WHERE client_contract_id IS NOT NULL");
}

type Param = string | number | null | bigint;

export function all<T = Record<string, any>>(sql: string, ...p: Param[]): T[] {
  return db().prepare(sql).all(...p).map((r) => ({ ...r })) as T[];
}
export function get<T = Record<string, any>>(sql: string, ...p: Param[]): T | undefined {
  const r = db().prepare(sql).get(...p);
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...p: Param[]): number {
  return Number(db().prepare(sql).run(...p).lastInsertRowid);
}
let depth = 0;
/** Transaction; nested calls become savepoints so a failure rolls back the whole outer unit. */
export function tx<T>(fn: () => T): T {
  const d = db();
  const sp = `sp${depth}`;
  d.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${sp}`);
  depth++;
  try {
    const out = fn();
    depth--;
    d.exec(depth === 0 ? "COMMIT" : `RELEASE ${sp}`);
    return out;
  } catch (e) {
    depth--;
    d.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}
export function setting(key: string, fallback = ""): string {
  return get<{ value: string }>("SELECT value FROM settings WHERE key=?", key)?.value ?? fallback;
}
