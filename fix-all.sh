#!/bin/bash

echo "🔧 Fixing TransparentRx Setup"
echo "============================="
echo ""

# Step 1: Create all tables in transparentrx-db
echo "📊 Creating tables in transparentrx-db..."

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, session_token TEXT, is_premium INTEGER DEFAULT 0, plan TEXT DEFAULT 'free', status TEXT DEFAULT 'active', stripe_customer_id TEXT, last_login DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS auth_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS usage_tracking (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT, ip_hash TEXT, ndc TEXT, used_at DATETIME DEFAULT CURRENT_TIMESTAMP);"

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS activity_feed (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS ndc_master (ndc_11 TEXT PRIMARY KEY, proprietary_name TEXT, nonproprietary_name TEXT, dosage_form TEXT, strength TEXT, route TEXT, labeler_name TEXT, last_updated DATETIME DEFAULT CURRENT_TIMESTAMP);"

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS nadac_prices (id INTEGER PRIMARY KEY AUTOINCREMENT, ndc TEXT NOT NULL, nadac_per_unit REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"

wrangler d1 execute transparentrx-db --command="CREATE TABLE IF NOT EXISTS retail_prices (id INTEGER PRIMARY KEY AUTOINCREMENT, ndc TEXT, drug_name TEXT, strength TEXT, pharmacy_name TEXT, cash_price REAL, scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP);"

echo "✅ Tables created"

# Step 2: Insert sample data
echo ""
echo "📝 Inserting sample data..."

wrangler d1 execute transparentrx-db --command="DELETE FROM activity_feed;"
wrangler d1 execute transparentrx-db --command="INSERT INTO activity_feed (message) VALUES ('🔍 Analyzing 18,000+ pharmacy price points...');"
wrangler d1 execute transparentrx-db --command="INSERT INTO activity_feed (message) VALUES ('💰 Calculating TruePrice™ fair market value...');"
wrangler d1 execute transparentrx-db --command="INSERT INTO activity_feed (message) VALUES ('📊 Cross-referencing NADAC pricing data...');"
wrangler d1 execute transparentrx-db --command="INSERT INTO activity_feed (message) VALUES ('🏥 Checking CMS Part D reimbursement rates...');"
wrangler d1 execute transparentrx-db --command="INSERT INTO activity_feed (message) VALUES ('💊 Fetching real-time pharmacy pricing...');"

wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO ndc_master (ndc_11, proprietary_name, nonproprietary_name, strength) VALUES ('00093-4150-01', 'Aspirin', 'Aspirin', '81 mg');"
wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO ndc_master (ndc_11, proprietary_name, nonproprietary_name, strength) VALUES ('00093-4151-01', 'Aspirin', 'Aspirin', '325 mg');"
wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO ndc_master (ndc_11, proprietary_name, nonproprietary_name, strength) VALUES ('00093-4152-01', 'Ibuprofen', 'Ibuprofen', '200 mg');"

wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO nadac_prices (ndc, nadac_per_unit) VALUES ('00093-4150-01', 0.05);"
wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO nadac_prices (ndc, nadac_per_unit) VALUES ('00093-4151-01', 0.08);"
wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO nadac_prices (ndc, nadac_per_unit) VALUES ('00093-4152-01', 0.12);"

wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO retail_prices (ndc, drug_name, strength, pharmacy_name, cash_price) VALUES ('00093-4150-01', 'Aspirin', '81 mg', 'CVS', 8.99);"
wrangler d1 execute transparentrx-db --command="INSERT OR IGNORE INTO retail_prices (ndc, drug_name, strength, pharmacy_name, cash_price) VALUES ('00093-4150-01', 'Aspirin', '81 mg', 'Walgreens', 9.49);"

echo "✅ Sample data inserted"

# Step 3: Verify
echo ""
echo "📊 Verification:"
wrangler d1 execute transparentrx-db --command="SELECT name FROM sqlite_master WHERE type='table';"

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "Now test your API:"
echo "  curl http://localhost:8787/api/activity"
echo "  curl 'http://localhost:8787/api/search?q=aspirin'"
