-- NDC Master table (100k+ rows)
CREATE TABLE IF NOT EXISTS ndc_master (
  ndc_11 TEXT PRIMARY KEY,
  proprietary_name TEXT,
  nonproprietary_name TEXT,
  active_ingredient TEXT,
  strength TEXT,
  dosage_form TEXT,
  route TEXT,
  labeler_name TEXT,
  marketing_category TEXT,
  package_description TEXT,
  nadac_price REAL,
  cms_price REAL,
  awp_price REAL,
  price_source_flag TEXT,
  last_updated TEXT
);

-- Create indexes for fast search
CREATE INDEX idx_proprietary ON ndc_master(proprietary_name);
CREATE INDEX idx_nonproprietary ON ndc_master(nonproprietary_name);
CREATE INDEX idx_ingredient ON ndc_master(active_ingredient);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  customer_id TEXT,
  status TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  last_updated TEXT
);

-- Usage tracking (optional)
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ndc TEXT,
  timestamp TEXT,
  user_id TEXT,
  calculation_type TEXT
);