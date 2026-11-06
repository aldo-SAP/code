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
    g.__db = d;
  }
  return g.__db;
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
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function setting(key: string, fallback = ""): string {
  return get<{ value: string }>("SELECT value FROM settings WHERE key=?", key)?.value ?? fallback;
}
