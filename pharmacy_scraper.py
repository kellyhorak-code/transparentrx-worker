"""
TransparentRx scraping worker
Collects pharmacy pricing data from multiple sources
"""

import requests
import time
import uuid
import json
import os
from typing import Dict, List, Any, Optional

# Try to import scrapers, with fallbacks
try:
    from canonical_map import canonicalize
except ImportError:
    def canonicalize(drug_name: str) -> str:
        """Simple canonicalization fallback"""
        return drug_name.lower().strip().replace(" ", "-")

try:
    from goodrx_scraper import scrape_goodrx
except ImportError:
    def scrape_goodrx(job: Dict) -> List[Dict]:
        """Mock GoodRx scraper"""
        print(f"⚠️ GoodRx scraper not implemented - using mock data")
        return []

try:
    from singlecare_scraper import scrape_singlecare
except ImportError:
    def scrape_singlecare(job: Dict) -> List[Dict]:
        """Mock SingleCare scraper"""
        return []

try:
    from wellrx_scraper import scrape_singlecare as scrape_wellrx
except ImportError:
    def scrape_wellrx(job: Dict) -> List[Dict]:
        """Mock WellRx scraper"""
        return []

try:
    from costplus_scraper import scrape_costplus
except ImportError:
    def scrape_costplus(job: Dict) -> List[Dict]:
        """Mock CostPlus scraper"""
        return []

try:
    from pharmacy_scraper import scrape as buzz_scrape
except ImportError:
    def buzz_scrape(drug_name: str, strength: str, quantity: int, zip_code: str) -> List[Dict]:
        """Mock buzz scraper"""
        print(f"⚠️ Buzz scraper not implemented")
        return []

from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
WORKER_URL = os.getenv("WORKER_URL", "https://transparentrx-worker.kellybhorak.workers.dev")
WORKER_ID = str(uuid.uuid4())[:8]

SCRAPERS = [
    ("GoodRx", scrape_goodrx),
    ("SingleCare", scrape_singlecare),
    ("WellRx", scrape_wellrx),
    ("CostPlus", scrape_costplus),
]


def scrape_all(job: Dict) -> List[Dict]:
    """Run all scrapers in parallel"""
    
    # Get initial prices from buzz scraper
    prices = []
    try:
        prices = buzz_scrape(
            job["drug_name"],
            job["strength"],
            job["quantity"],
            job["zip_code"]
        )
        print(f"[{WORKER_ID}] Buzz scraper: {len(prices)} prices")
    except Exception as e:
        print(f"[{WORKER_ID}] Buzz scraper failed: {e}")

    # Run other scrapers in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(fn, job): name
            for name, fn in SCRAPERS
        }

        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result(timeout=30)
                count = len(result) if result else 0
                print(f"[{WORKER_ID}] {name}: {count} prices")
                if result:
                    prices.extend(result)
            except Exception as e:
                print(f"[{WORKER_ID}] {name} failed: {e}")

    print(f"[{WORKER_ID}] Total prices collected: {len(prices)}")
    return prices


def post_prices(prices: List[Dict], job: Dict) -> bool:
    """Post collected prices to the main API"""
    success = True
    drug_key = canonicalize(job["drug_name"])
    
    for p in prices:
        payload = {
            "ndc": job.get("ndc"),
            "drug_key": drug_key,
            "drug_name": job["drug_name"],
            "strength": job["strength"],
            "quantity": job["quantity"],
            "zip_code": job["zip_code"],
            "pharmacy_name": p.get("pharmacy_name", "Unknown"),
            "pharmacy_chain": p.get("pharmacy_chain", p.get("pharmacy_name", "Unknown")),
            "cash_price": float(p.get("cash_price", 0)),
            "coupon_price": float(p.get("coupon_price", p.get("cash_price", 0))),
            "price_type": p.get("price_type", "cash"),
            "latitude": p.get("latitude"),
            "longitude": p.get("longitude"),
            "source": p.get("source", "unknown")
        }

        try:
            r = requests.post(
                WORKER_URL + "/api/retail-price",
                json=payload,
                timeout=10
            )
            if r.status_code != 200:
                print(f"[{WORKER_ID}] Insert failed for {payload['pharmacy_name']}: {r.status_code} {r.text}")
                success = False
            else:
                print(f"[{WORKER_ID}] Inserted: {payload['pharmacy_name']} - ${payload['cash_price']}")
        except Exception as e:
            print(f"[{WORKER_ID}] POST error for {payload['pharmacy_name']}: {e}")
            success = False

    return success


def main():
    """Main worker loop"""
    print(f"🚀 TransparentRx Scraping Worker started [{WORKER_ID}]", flush=True)
    print(f"📡 API URL: {WORKER_URL}", flush=True)

    while True:
        try:
            # Get next job
            r = requests.get(
                WORKER_URL + "/api/next-job",
                timeout=10
            )
            
            if r.status_code != 200:
                print(f"[{WORKER_ID}] Failed to get job: {r.status_code}")
                time.sleep(5)
                continue

            job = r.json()

            if not job:
                print(f"[{WORKER_ID}] No pending jobs — waiting 10s")
                time.sleep(10)
                continue

            print(f"\n[{WORKER_ID}] 📋 Processing Job {job['id']}")
            print(f"   Drug: {job['drug_name']} {job['strength']}")
            print(f"   Quantity: {job['quantity']}")
            print(f"   ZIP: {job['zip_code']}")

            # Scrape prices
            prices = scrape_all(job)

            if not prices:
                print(f"[{WORKER_ID}] ⚠️ No prices found for {job['drug_name']}")
                # Mark as complete anyway to avoid infinite retries
                requests.post(
                    WORKER_URL + "/api/job-complete",
                    json={"id": job["id"], "status": "no_data"},
                    timeout=10,
                )
                continue

            # Post prices
            success = post_prices(prices, job)

            if success:
                # Mark job as complete
                complete_response = requests.post(
                    WORKER_URL + "/api/job-complete",
                    json={"id": job["id"]},
                    timeout=10,
                )
                print(f"[{WORKER_ID}] ✅ Job {job['id']} complete - {len(prices)} prices stored")
            else:
                print(f"[{WORKER_ID}] ❌ Job {job['id']} failed — will retry later")
                # Don't mark as complete, will retry

        except requests.exceptions.ConnectionError:
            print(f"[{WORKER_ID}] 🔌 Connection error - retrying in 10s")
            time.sleep(10)
        except Exception as e:
            print(f"[{WORKER_ID}] 💥 Worker error: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()
