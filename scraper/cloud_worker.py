from pharmacy_scraper import scrape as buzz_scrape
"""
TransparentRx scraping worker
"""

import requests
import time
import uuid
from canonical_map import canonicalize

from goodrx_scraper import scrape_goodrx
from singlecare_scraper import scrape_singlecare
from wellrx_scraper import scrape_wellrx
from costplus_scraper import scrape_costplus

from concurrent.futures import ThreadPoolExecutor, as_completed

WORKER_URL = "https://transparentrx-pricing.kellybhorak.workers.dev"

WORKER_ID = str(uuid.uuid4())[:8]

SCRAPERS = [
    ("GoodRx", scrape_goodrx),
    ("SingleCare", scrape_singlecare),
    ("WellRx", scrape_wellrx),
    ("CostPlus", scrape_costplus),
]


def scrape_all(job):

    prices = buzz_scrape(job["drug_name"],job["strength"],job["quantity"],job["zip_code"])

    with ThreadPoolExecutor(max_workers=4) as executor:

        futures = {
            executor.submit(fn, job): name
            for name, fn in SCRAPERS
        }

        for future in as_completed(futures):

            name = futures[future]

            try:

                result = future.result()

                count = len(result) if result else 0

                print(f"[{WORKER_ID}] {name}: {count} prices")

                if result:
                    prices += result

            except Exception as e:

                print(f"[{WORKER_ID}] {name} failed: {e}")

    print(f"[{WORKER_ID}] Total prices: {len(prices)}")

    return prices


def post_prices(prices, job):

    success = True

    for p in prices:
        drug_key = canonicalize(job["drug_name"])
        payload = {
            "ndc": job.get("ndc"),
            "drug_key": drug_key,
            "drug_name": job["drug_name"],
            "drug_key": drug_key,
            "strength": job["strength"],
            "quantity": job["quantity"],
            "zip_code": job["zip_code"],
            "pharmacy_name": p["pharmacy_name"],
            "pharmacy_chain": p.get("pharmacy_chain", p["pharmacy_name"]),
            "cash_price": float(p["cash_price"]),
            "coupon_price": float(p.get("coupon_price", p["cash_price"])),
            "price_type": p.get("price_type", "cash"),
            "latitude": None,
            "longitude": None,
            "source": p["source"]
        }



        try:

            r = requests.post(
                WORKER_URL + "/api/retail-price",
                json=payload,
                timeout=10
            )

            if r.status_code != 200:
                print(f"[{WORKER_ID}] Insert failed {r.status_code} {r.text}")
                success = False

        except Exception as e:

            print(f"[{WORKER_ID}] POST error: {e}")
            success = False

    return success


def main():

    print(f"TransparentRx Worker started [{WORKER_ID}]", flush=True)

    while True:

        try:

            r = requests.get(
                WORKER_URL + "/api/next-job",
                timeout=10
            )

            job = r.json()

            if not job:

                print(f"[{WORKER_ID}] No jobs — waiting 5s")

                time.sleep(5)

                continue

            print(
                f"[{WORKER_ID}] Job {job['id']} → {job['drug_name']} {job['strength']} x{job['quantity']} @ {job['zip_code']}"
            )

            prices = scrape_all(job)

            success = post_prices(prices, job)

            if success:

                requests.post(
                    WORKER_URL + "/api/job-complete",
                    json={"id": job["id"]},
                    timeout=10,
                )

                print(f"[{WORKER_ID}] Job {job['id']} complete")

            else:

                print(f"[{WORKER_ID}] Job {job['id']} failed — will retry")

        except Exception as e:

            print(f"[{WORKER_ID}] Worker error: {e}")

            time.sleep(5)


if __name__ == "__main__":
    main()
