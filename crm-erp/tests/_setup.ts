/**
 * Test database. By default an in-memory embedded Postgres (PGlite).
 * With TEST_DATABASE_URL set, each test file gets its own fresh database on that real server,
 * which exercises the production driver (postgres.js) too.
 */
export async function useTestDb() {
  const base = process.env.TEST_DATABASE_URL;
  delete process.env.DATABASE_URL;
  if (!base) { process.env.DB_PATH = ":memory:"; return; }
  const postgres = (await import("postgres")).default;
  const admin = postgres(base, { max: 1, ssl: false });
  const name = "t_" + Math.random().toString(36).slice(2, 10);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(base);
  u.pathname = "/" + name;
  process.env.DATABASE_URL = u.toString();
  process.env.DATABASE_SSL = "off";
}
