-- Create users table
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

-- Create auth_tokens table
CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create usage_tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT,
  ip_hash TEXT,
  ndc TEXT,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create activity_feed table
CREATE TABLE IF NOT EXISTS activity_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample activity messages
INSERT INTO activity_feed (message) VALUES ('🔍 Analyzing 18,000+ pharmacy price points...');
INSERT INTO activity_feed (message) VALUES ('💰 Calculating TruePrice™ fair market value...');
INSERT INTO activity_feed (message) VALUES ('📊 Cross-referencing NADAC pricing data...');
INSERT INTO activity_feed (message) VALUES ('🏥 Checking CMS Part D reimbursement rates...');
INSERT INTO activity_feed (message) VALUES ('💊 Fetching real-time pharmacy pricing...');
INSERT INTO activity_feed (message) VALUES ('📍 Applying geographic pricing adjustments...');
INSERT INTO activity_feed (message) VALUES ('🔬 Computing PBM spread and extraction zones...');
INSERT INTO activity_feed (message) VALUES ('📈 Calculating your break-even economics...');
INSERT INTO activity_feed (message) VALUES ('🏪 Comparing against 15+ pharmacy chains...');
INSERT INTO activity_feed (message) VALUES ('✨ Generating personalized savings report...');
