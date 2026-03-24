-- ====================================================================
-- Complete Schema Migration for TransparentRx
-- Adds all missing tables and indexes
-- ====================================================================

-- Drug Search Index Table (for fast autocomplete)
CREATE TABLE IF NOT EXISTS drug_search (
  ndc TEXT PRIMARY KEY,
  display_name TEXT,
  drug_key TEXT,
  brand_name TEXT,
  strength TEXT,
  dosage_form TEXT,
  top_250 INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drug_search_name ON drug_search(display_name);
CREATE INDEX IF NOT EXISTS idx_drug_search_key ON drug_search(drug_key);

-- Transdex Index (TruePrice™ market data)
CREATE TABLE IF NOT EXISTS transdex_index (
  ndc TEXT PRIMARY KEY,
  acquisition_cost REAL,
  market_low REAL,
  true_price REAL,
  market_high REAL,
  retail_price REAL,
  sample_size INTEGER,
  confidence TEXT,
  updated_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_transdex_ndc ON transdex_index(ndc);

-- Free Usage Tracking (anti-abuse)
CREATE TABLE IF NOT EXISTS free_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type TEXT,
  signal_value TEXT,
  email TEXT,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_free_usage_signal ON free_usage(signal_type, signal_value);
CREATE INDEX IF NOT EXISTS idx_free_usage_email ON free_usage(email);

-- Email Sends (rate limiting)
CREATE TABLE IF NOT EXISTS email_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  ip_hash TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_sends_email ON email_sends(email);
CREATE INDEX IF NOT EXISTS idx_email_sends_sent_at ON email_sends(sent_at);

-- Pharmacy Locations Table
CREATE TABLE IF NOT EXISTS pharmacies (
  npi TEXT PRIMARY KEY,
  ncpdp_id TEXT,
  name TEXT,
  chain TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  lat REAL,
  lon REAL,
  verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pharmacies_chain ON pharmacies(chain);
CREATE INDEX IF NOT EXISTS idx_pharmacies_zip ON pharmacies(zip);
CREATE INDEX IF NOT EXISTS idx_pharmacies_ncpdp ON pharmacies(ncpdp_id);

-- Scrape Jobs Table (ensure exists)
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drug_name TEXT,
  strength TEXT,
  quantity INTEGER,
  zip_code TEXT,
  ndc TEXT,
  tier TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_drug ON scrape_jobs(drug_name);

-- Retail By Drug (aggregated view)
CREATE TABLE IF NOT EXISTS retail_by_drug (
  drug_key TEXT,
  strength TEXT,
  quantity INTEGER,
  observed_retail_low REAL,
  observed_retail_median REAL,
  observed_retail_high REAL,
  pharmacy_count INTEGER,
  observations INTEGER,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (drug_key, strength, quantity)
);

-- Scheduler Runs Log
CREATE TABLE IF NOT EXISTS scheduler_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_time DATETIME,
  task TEXT,
  records_processed INTEGER
);

-- User Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT,
  type TEXT,
  expires_at DATETIME,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

-- Update users table with missing columns
ALTER TABLE users ADD COLUMN demo_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN updated_at DATETIME;

-- Create views for admin dashboards
CREATE VIEW IF NOT EXISTS v_scraper_stats AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_jobs,
  SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
FROM scrape_jobs
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE VIEW IF NOT EXISTS v_pharmacy_coverage AS
SELECT 
  chain,
  COUNT(*) as locations,
  COUNT(DISTINCT zip) as zip_codes
FROM pharmacies
GROUP BY chain
ORDER BY locations DESC;

SELECT '✅ Complete schema migration finished!' as status;
