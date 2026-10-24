PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, sha256 TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receipt_image','invoice_pdf','email','mbox','bank_csv','unknown')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','processed','failed','skipped')),
  error TEXT, created_at TEXT NOT NULL, processed_at TEXT
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, file_id TEXT REFERENCES files(id),
  merchant TEXT NOT NULL, item_name TEXT, order_number TEXT,
  amount REAL, currency TEXT, purchase_date TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('purchase','trial','subscription','other')),
  merchant_email TEXT, policy_text TEXT, confidence REAL NOT NULL, needs_review INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY, merchant TEXT NOT NULL, normalized_name TEXT UNIQUE NOT NULL,
  monthly_cost REAL NOT NULL, cadence TEXT NOT NULL CHECK (cadence IN ('weekly','monthly','yearly')),
  first_seen TEXT NOT NULL, last_charged TEXT NOT NULL, charge_count INTEGER NOT NULL,
  last_amount REAL, price_change REAL DEFAULT 0, flags TEXT NOT NULL DEFAULT '[]',
  category TEXT, reason TEXT, unused INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','keep'))
);
CREATE TABLE IF NOT EXISTS deadlines (
  id TEXT PRIMARY KEY, item_id TEXT REFERENCES items(id), subscription_id TEXT REFERENCES subscriptions(id),
  type TEXT NOT NULL CHECK (type IN ('trial_end','return_by','warranty_until','renewal')),
  due_date TEXT NOT NULL, amount_at_risk REAL,
  source TEXT NOT NULL CHECK (source IN ('document','policy','llm_guess')),
  confidence REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed','expired')),
  ics_path TEXT, created_at TEXT NOT NULL,
  UNIQUE(item_id, type), UNIQUE(subscription_id, type)
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY, deadline_id TEXT REFERENCES deadlines(id), subscription_id TEXT REFERENCES subscriptions(id),
  type TEXT NOT NULL CHECK (type IN ('cancel_email','return_email','warranty_email','review')),
  title TEXT NOT NULL, to_address TEXT, subject TEXT, body TEXT NOT NULL,
  potential_saving REAL NOT NULL DEFAULT 0,
  saving_period TEXT NOT NULL DEFAULT 'one_time' CHECK (saving_period IN ('one_time','monthly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','snoozed','dismissed')),
  snooze_until TEXT, created_at TEXT NOT NULL, decided_at TEXT
);
CREATE TABLE IF NOT EXISTS savings (
  id TEXT PRIMARY KEY, action_id TEXT REFERENCES actions(id), amount REAL NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('one_time','monthly')), note TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
  files_processed INTEGER DEFAULT 0, brief TEXT, log_json TEXT
);
