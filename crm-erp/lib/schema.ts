export const SCHEMA = `

CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, country TEXT,
  worker_type TEXT NOT NULL DEFAULT 'external' CHECK (worker_type IN ('internal','external')),
  stage TEXT NOT NULL DEFAULT 'applicant' CHECK (stage IN ('applicant','training','ready','placed','alumni')),
  skills TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT to_char(current_date, 'YYYY-MM-DD')
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','worker')),
  person_id INTEGER REFERENCES people(id), active INTEGER NOT NULL DEFAULT 1,
  auth_method TEXT NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password','microsoft','both')),
  ms_oid TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, country TEXT, address TEXT, email TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR', status TEXT NOT NULL DEFAULT 'active', notes TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT, phone TEXT, role TEXT
);
CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, client_id INTEGER REFERENCES clients(id),
  company_name TEXT, contact_name TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','qualified','proposal','negotiation','won','lost')),
  value DOUBLE PRECISION NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'EUR', expected_close TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, start_date TEXT, end_date TEXT, description TEXT
);
CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','completed','dropped')),
  progress INTEGER NOT NULL DEFAULT 0, UNIQUE (person_id, course_id)
);
-- kind 'client': contract with a client. kind 'freelancer': contract with an external person.
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('client','freelancer')),
  client_id INTEGER REFERENCES clients(id), person_id INTEGER REFERENCES people(id),
  title TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', start_date TEXT, end_date TEXT,
  payment_terms TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_terms IN ('monthly','milestone')),
  net_days INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'active', notes TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','paused','done')),
  start_date TEXT, end_date TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  billing_type TEXT NOT NULL CHECK (billing_type IN ('hourly','daily','fixed','monthly')),
  hours_per_day DOUBLE PRECISION NOT NULL DEFAULT 8, start_date TEXT NOT NULL, end_date TEXT,
  client_contract_id INTEGER REFERENCES contracts(id),
  freelancer_contract_id INTEGER REFERENCES contracts(id),
  direct_to_client INTEGER NOT NULL DEFAULT 0, role_title TEXT, notes TEXT
);
-- Unit follows the assignment billing type (per hour, per day, or per month). Effective-dated.
CREATE TABLE IF NOT EXISTS rates (
  id SERIAL PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bill','cost')), amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR', effective_from TEXT NOT NULL
);
-- Y works instead of X during a date range. cost_* = what we pay Y (external only).
CREATE TABLE IF NOT EXISTS substitutions (
  id SERIAL PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id), from_date TEXT NOT NULL, to_date TEXT NOT NULL,
  cost_amount DOUBLE PRECISION, cost_currency TEXT NOT NULL DEFAULT 'EUR', reason TEXT
);
CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  title TEXT NOT NULL, bill_amount DOUBLE PRECISION NOT NULL DEFAULT 0, bill_currency TEXT NOT NULL DEFAULT 'EUR',
  cost_amount DOUBLE PRECISION NOT NULL DEFAULT 0, cost_currency TEXT NOT NULL DEFAULT 'EUR', due_date TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','approved','cancelled')),
  approved_on TEXT, invoice_id INTEGER, payout_id INTEGER
);
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id SERIAL PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES people(id), work_date TEXT NOT NULL, hours DOUBLE PRECISION NOT NULL,
  note TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  invoice_id INTEGER, payout_id INTEGER, UNIQUE (assignment_id, worker_id, work_date)
);
CREATE TABLE IF NOT EXISTS leave (
  id SERIAL PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vacation','sick','holiday','other')),
  from_date TEXT NOT NULL, to_date TEXT NOT NULL, notes TEXT
);
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY, number TEXT UNIQUE, client_id INTEGER NOT NULL REFERENCES clients(id),
  period TEXT NOT NULL, currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  issue_date TEXT, due_date TEXT, net_days INTEGER NOT NULL DEFAULT 30, total DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  project_id INTEGER, assignment_id INTEGER, person_id INTEGER, kind TEXT NOT NULL,
  description TEXT NOT NULL, detail TEXT, quantity DOUBLE PRECISION NOT NULL, unit TEXT NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL, amount DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
  id SERIAL PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), period TEXT NOT NULL,
  currency TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('payroll','contractor')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')), total DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payout_lines (
  id SERIAL PRIMARY KEY, payout_id INTEGER NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  project_id INTEGER, assignment_id INTEGER, kind TEXT NOT NULL, description TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL, unit TEXT NOT NULL, unit_price DOUBLE PRECISION NOT NULL, amount DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS fx_rates (
  id SERIAL PRIMARY KEY, currency TEXT NOT NULL, rate_to_eur DOUBLE PRECISION NOT NULL, as_of TEXT NOT NULL,
  UNIQUE (currency, as_of)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Leave approval workflow (requested -> approved / rejected / cancelled). Rows created by managers are approved at once.
ALTER TABLE leave ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE leave ADD COLUMN IF NOT EXISTS days INTEGER;
ALTER TABLE leave ADD COLUMN IF NOT EXISTS requested_by INTEGER;
ALTER TABLE leave ADD COLUMN IF NOT EXISTS requested_at TEXT;
ALTER TABLE leave ADD COLUMN IF NOT EXISTS decided_by INTEGER;
ALTER TABLE leave ADD COLUMN IF NOT EXISTS decided_by_name TEXT;
ALTER TABLE leave ADD COLUMN IF NOT EXISTS decided_at TEXT;
ALTER TABLE leave ADD COLUMN IF NOT EXISTS decision_note TEXT;
-- Yearly vacation allowance per person (falls back to the company default in settings: default_leave_days, 20 if unset).
CREATE TABLE IF NOT EXISTS leave_allowance (
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE, year INTEGER NOT NULL, days DOUBLE PRECISION NOT NULL, note TEXT,
  PRIMARY KEY (person_id, year)
);
-- One email thread per leave request: later messages reply to the first one.
CREATE TABLE IF NOT EXISTS email_threads (
  thread_key TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL, graph_message_id TEXT,
  root_message_id TEXT, last_message_id TEXT, updated_at TEXT NOT NULL DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')
);
-- Every email the app tries to send, with the outcome, so nothing is lost silently.
CREATE TABLE IF NOT EXISTS email_outbox (
  id SERIAL PRIMARY KEY, created_at TEXT NOT NULL DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'),
  to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', error TEXT, attempts INTEGER NOT NULL DEFAULT 0, sent_at TEXT, related TEXT
);
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS cc_addr TEXT;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS thread_key TEXT;

-- Append-only history of who did what. Triggers block edits, deletes and truncation.
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, created_at TEXT NOT NULL DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'),
  user_id INTEGER, user_name TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER,
  summary TEXT NOT NULL, details TEXT, reason TEXT, ip TEXT, country TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity, entity_id);
CREATE OR REPLACE FUNCTION audit_block() RETURNS trigger AS $fn$ BEGIN RAISE EXCEPTION 'audit log is append-only'; END; $fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_mod ON audit_log;
CREATE TRIGGER audit_no_mod BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_block();
DROP TRIGGER IF EXISTS audit_no_truncate ON audit_log;
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_block();

-- Lock the tables down: row-level security with no policies means the public API roles
-- (Supabase anon/authenticated) can read nothing. The app connects as the table owner.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_assignment_contract ON assignments(client_contract_id) WHERE client_contract_id IS NOT NULL;
`;
