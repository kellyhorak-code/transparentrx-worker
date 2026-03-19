CREATE TABLE IF NOT EXISTS scrape_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ndc TEXT,
  drug_name TEXT,
  strength TEXT,
  quantity INTEGER,
  zip_code TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status
ON scrape_jobs(status);

CREATE INDEX IF NOT EXISTS idx_jobs_created
ON scrape_jobs(created_at);

CREATE TABLE IF NOT EXISTS retail_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ndc TEXT,
  drug_name TEXT,
  strength TEXT,
  quantity INTEGER,
  pharmacy_name TEXT,
  pharmacy_chain TEXT,
  cash_price REAL,
  coupon_price REAL,
  price_type TEXT,
  zip_code TEXT,
  latitude REAL,
  longitude REAL,
  source TEXT,
  scraped_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_retail_drug
ON retail_prices(drug_name);

CREATE INDEX IF NOT EXISTS idx_retail_zip
ON retail_prices(zip_code);

CREATE INDEX IF NOT EXISTS idx_retail_transdex
ON retail_prices(drug_name, strength, quantity);
