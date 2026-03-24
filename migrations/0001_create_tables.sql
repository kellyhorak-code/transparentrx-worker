-- ====================================================================
-- TransparentRx Database Migration
-- Version: 0001
-- ====================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  session_token TEXT,
  is_premium INTEGER DEFAULT 0,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);

-- Auth tokens table
CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);

-- Usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT,
  ip_hash TEXT,
  ndc TEXT,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_fingerprint ON usage_tracking(fingerprint);
CREATE INDEX IF NOT EXISTS idx_usage_ip_hash ON usage_tracking(ip_hash);
CREATE INDEX IF NOT EXISTS idx_usage_used_at ON usage_tracking(used_at);

-- Activity feed table
CREATE TABLE IF NOT EXISTS activity_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_feed(created_at);

-- Sample activity messages
INSERT OR IGNORE INTO activity_feed (message) VALUES
  ('🔍 Analyzing 18,000+ pharmacy price points...'),
  ('💰 Calculating TruePrice™ fair market value...'),
  ('📊 Cross-referencing NADAC pricing data...'),
  ('🏥 Checking CMS Part D reimbursement rates...'),
  ('💊 Fetching real-time pharmacy pricing...'),
  ('📍 Applying geographic pricing adjustments...'),
  ('🔬 Computing PBM spread and extraction zones...'),
  ('📈 Calculating your break-even economics...'),
  ('🏪 Comparing against 15+ pharmacy chains...'),
  ('✨ Generating personalized savings report...');

SELECT '✅ Migration completed successfully!' as status;
