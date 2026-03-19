CREATE TABLE IF NOT EXISTS users (
  email               TEXT PRIMARY KEY,
  stripe_customer_id  TEXT,
  plan                TEXT DEFAULT 'free',
  status              TEXT DEFAULT 'free',
  demo_used           INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  type        TEXT DEFAULT 'session',
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  used        INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_email   ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS free_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type   TEXT NOT NULL,
  signal_value  TEXT NOT NULL,
  email         TEXT,
  used_at       TEXT DEFAULT (datetime('now')),
  UNIQUE(signal_type, signal_value)
);
CREATE INDEX IF NOT EXISTS idx_usage_signal ON free_usage(signal_type, signal_value);
CREATE INDEX IF NOT EXISTS idx_usage_email  ON free_usage(email);

CREATE TABLE IF NOT EXISTS email_sends (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  ip_hash    TEXT,
  sent_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_sends_email ON email_sends(email);
CREATE INDEX IF NOT EXISTS idx_email_sends_ip    ON email_sends(ip_hash);
CREATE INDEX IF NOT EXISTS idx_email_sends_sent  ON email_sends(sent_at);
