export const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, country TEXT,
  worker_type TEXT NOT NULL DEFAULT 'external' CHECK (worker_type IN ('internal','external')),
  stage TEXT NOT NULL DEFAULT 'applicant' CHECK (stage IN ('applicant','training','ready','placed','alumni')),
  skills TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','worker')),
  person_id INTEGER REFERENCES people(id), active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT, address TEXT, email TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR', status TEXT NOT NULL DEFAULT 'active', notes TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT, phone TEXT, role TEXT
);
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, client_id INTEGER REFERENCES clients(id),
  company_name TEXT, contact_name TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','qualified','proposal','negotiation','won','lost')),
  value REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'EUR', expected_close TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, start_date TEXT, end_date TEXT, description TEXT
);
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','completed','dropped')),
  progress INTEGER NOT NULL DEFAULT 0, UNIQUE (person_id, course_id)
);
-- kind 'client': contract with a client. kind 'freelancer': contract with an external person.
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('client','freelancer')),
  client_id INTEGER REFERENCES clients(id), person_id INTEGER REFERENCES people(id),
  title TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', start_date TEXT, end_date TEXT,
  payment_terms TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_terms IN ('monthly','milestone')),
  net_days INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'active', notes TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id),
  client_contract_id INTEGER REFERENCES contracts(id), name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','paused','done')),
  start_date TEXT, end_date TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  billing_type TEXT NOT NULL CHECK (billing_type IN ('hourly','daily','fixed','monthly')),
  hours_per_day REAL NOT NULL DEFAULT 8, start_date TEXT NOT NULL, end_date TEXT,
  freelancer_contract_id INTEGER REFERENCES contracts(id),
  direct_to_client INTEGER NOT NULL DEFAULT 0, role_title TEXT, notes TEXT
);
-- Unit follows the assignment billing type (per hour, per day, or per month). Effective-dated.
CREATE TABLE IF NOT EXISTS rates (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bill','cost')), amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR', effective_from TEXT NOT NULL
);
-- Y works instead of X during a date range. cost_* = what we pay Y (external only).
CREATE TABLE IF NOT EXISTS substitutions (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id), from_date TEXT NOT NULL, to_date TEXT NOT NULL,
  cost_amount REAL, cost_currency TEXT NOT NULL DEFAULT 'EUR', reason TEXT
);
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  title TEXT NOT NULL, bill_amount REAL NOT NULL DEFAULT 0, bill_currency TEXT NOT NULL DEFAULT 'EUR',
  cost_amount REAL NOT NULL DEFAULT 0, cost_currency TEXT NOT NULL DEFAULT 'EUR', due_date TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','approved','cancelled')),
  approved_on TEXT, invoice_id INTEGER, payout_id INTEGER
);
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES people(id), work_date TEXT NOT NULL, hours REAL NOT NULL,
  note TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  invoice_id INTEGER, payout_id INTEGER, UNIQUE (assignment_id, worker_id, work_date)
);
CREATE TABLE IF NOT EXISTS leave (
  id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vacation','sick','holiday','other')),
  from_date TEXT NOT NULL, to_date TEXT NOT NULL, notes TEXT
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE, client_id INTEGER NOT NULL REFERENCES clients(id),
  period TEXT NOT NULL, currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  issue_date TEXT, due_date TEXT, net_days INTEGER NOT NULL DEFAULT 30, total REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  project_id INTEGER, assignment_id INTEGER, person_id INTEGER, kind TEXT NOT NULL,
  description TEXT NOT NULL, detail TEXT, quantity REAL NOT NULL, unit TEXT NOT NULL,
  unit_price REAL NOT NULL, amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id), period TEXT NOT NULL,
  currency TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('payroll','contractor')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')), total REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payout_lines (
  id INTEGER PRIMARY KEY, payout_id INTEGER NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  project_id INTEGER, assignment_id INTEGER, kind TEXT NOT NULL, description TEXT NOT NULL,
  quantity REAL NOT NULL, unit TEXT NOT NULL, unit_price REAL NOT NULL, amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS fx_rates (
  id INTEGER PRIMARY KEY, currency TEXT NOT NULL, rate_to_eur REAL NOT NULL, as_of TEXT NOT NULL,
  UNIQUE (currency, as_of)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
