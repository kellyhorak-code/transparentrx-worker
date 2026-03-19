-- =========================================================
-- Add refresh tier tracking to scrape_jobs
-- Run after schema.sql
-- =========================================================

-- Add tier + last_scraped to a drug_refresh_schedule table
CREATE TABLE IF NOT EXISTS drug_refresh_schedule (

  id            INTEGER PRIMARY KEY AUTOINCREMENT,

  drug_name     TEXT NOT NULL,
  strength      TEXT NOT NULL,
  tier          TEXT NOT NULL,   -- 'daily' | 'weekly' | 'monthly'

  last_scraped_at  TEXT,         -- ISO timestamp of last completed scrape
  next_scrape_at   TEXT,         -- ISO timestamp when next scrape is due
  scrape_count     INTEGER DEFAULT 0,

  UNIQUE(drug_name, strength)

);

CREATE INDEX IF NOT EXISTS idx_schedule_tier
ON drug_refresh_schedule(tier);

CREATE INDEX IF NOT EXISTS idx_schedule_next
ON drug_refresh_schedule(next_scrape_at);

CREATE INDEX IF NOT EXISTS idx_schedule_due
ON drug_refresh_schedule(next_scrape_at, tier);