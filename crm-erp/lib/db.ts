import { AsyncLocalStorage } from "node:async_hooks";
import { SCHEMA } from "./schema.ts";

/**
 * One async data layer over two engines:
 *  - DATABASE_URL set  -> Postgres (Supabase in production)
 *  - otherwise         -> embedded Postgres (PGlite) in data/pgdata, or in memory with DB_PATH=:memory:
 * Same SQL dialect everywhere, so local behaviour matches production.
 */
interface Conn { query(sql: string, params: unknown[]): Promise<any[]> }
interface Driver { conn: Conn; begin<T>(fn: (c: Conn) => Promise<T>): Promise<T>; exec(sql: string): Promise<void> }

const g = globalThis as unknown as { __dbp?: Promise<Driver>; __als?: AsyncLocalStorage<{ conn: Conn; depth: number }> };
const als = (g.__als ??= new AsyncLocalStorage());

async function open(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, {
      max: Number(process.env.DATABASE_POOL ?? 8), prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {},
      ssl: process.env.DATABASE_SSL === "off" ? false : "require",
      types: {
        bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
        numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      },
    });
    const wrap = (c: any): Conn => ({ query: async (q, p) => [...(await c.unsafe(q, p as any[]))] });
    return { conn: wrap(sql), begin: (fn) => sql.begin((t: any) => fn(wrap(t))) as Promise<any>, exec: async (q) => { await sql.unsafe(q); } };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const path = process.env.DB_PATH ?? "data/pgdata";
  const parsers = { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) };
  const pg = path === ":memory:" ? new PGlite({ parsers }) : new PGlite(path, { parsers });
  await pg.waitReady;
  const wrap = (c: any): Conn => ({ query: async (q, p) => (await c.query(q, p)).rows });
  return { conn: wrap(pg), begin: (fn) => pg.transaction((t: any) => fn(wrap(t))), exec: async (q) => { await pg.exec(q); } };
}

function driver(): Promise<Driver> {
  return (g.__dbp ??= open().then(async (d) => { await d.exec(SCHEMA); return d; }));
}

/** `?` placeholders to `$1..$n` (quoted strings are left alone). */
export function toPg(sql: string): string {
  let out = "", n = 0, q = false;
  for (const ch of sql) {
    if (ch === "'") q = !q;
    out += ch === "?" && !q ? `$${++n}` : ch;
  }
  return out;
}

type Param = string | number | null | bigint;
async function q(sql: string, p: Param[]): Promise<any[]> {
  const conn = als.getStore()?.conn ?? (await driver()).conn;
  return conn.query(toPg(sql), p);
}

export async function all<T = Record<string, any>>(sql: string, ...p: Param[]): Promise<T[]> {
  return (await q(sql, p)) as T[];
}
export async function get<T = Record<string, any>>(sql: string, ...p: Param[]): Promise<T | undefined> {
  return (await q(sql, p))[0] as T | undefined;
}
/** Runs a statement. INSERTs return the new row id (tables without an id column, or with ON CONFLICT, return 0). */
export async function run(sql: string, ...p: Param[]): Promise<number> {
  const wantsId = /^\s*insert\s/i.test(sql) && !/on\s+conflict|returning|into\s+settings\b/i.test(sql);
  const rows = await q(wantsId ? `${sql} RETURNING id` : sql, p);
  return wantsId ? Number(rows[0]?.id ?? 0) : 0;
}

/** Transaction. Calls nested inside become savepoints, so a failure rolls back the whole outer unit. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  const store = als.getStore();
  if (store) {
    const sp = `sp${++store.depth}`;
    await store.conn.query(`SAVEPOINT ${sp}`, []);
    try {
      const out = await fn();
      await store.conn.query(`RELEASE SAVEPOINT ${sp}`, []);
      store.depth--;
      return out;
    } catch (e) {
      await store.conn.query(`ROLLBACK TO SAVEPOINT ${sp}`, []);
      store.depth--;
      throw e;
    }
  }
  return (await driver()).begin((conn) => als.run({ conn, depth: 0 }, fn));
}

export async function setting(key: string, fallback = ""): Promise<string> {
  return (await get<{ value: string }>("SELECT value FROM settings WHERE key=?", key))?.value ?? fallback;
}
