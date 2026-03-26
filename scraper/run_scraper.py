#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests, time, uuid, logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pharmacy_scraper import scrape as buzz_scrape

try:
    from drug_catalog import TIER_1_DAILY
except ImportError:
    TIER_1_DAILY = [("lisinopril","10mg"),("metformin","500mg"),("atorvastatin","20mg"),
                    ("amlodipine","5mg"),("losartan","50mg"),("gabapentin","300mg"),
                    ("omeprazole","20mg"),("levothyroxine","50mcg"),("hydrochlorothiazide","25mg")]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

WORKER_URL = "https://transparentrx-worker.kellybhorak.workers.dev"
WORKER_ID  = str(uuid.uuid4())[:8]

ZIPS = ["76102","10001","75201","60601","90001","33101","98101","30301","85001","19103"]
QUANTITIES = [30, 90]

# Multiple pharmacy NPIs for geographic spread

def scrape_pharmacy(drug_name, strength, quantity, zip_code, pharmacy):
    try:
        from pharmacy_scraper import search_drug, buzz_headers, STRENGTHS_URL
        import requests as req

        drug_id = search_drug(drug_name)
        if not drug_id:
            return []

        r = req.post(STRENGTHS_URL, headers=buzz_headers(), json={
            "messageCode": "nnIWk4P2",
            "clientID": "RXCOMP-CVS",
            "drugParameters": {"drugNameID": drug_id},
            "location": {"npis": [pharmacy["npi"]]},
            "options": {"includeDrugDictionary": True}
        }, timeout=15)

        data = r.json()
        price_data = data.get("data", {}).get("price", {})
        results = price_data.get("results", [])
        drug_dict = price_data.get("drugDictionary", [])

        matched_ndc = None
        target = strength.lower().replace(" ", "")
        for drug in drug_dict:
            for form in drug.get("forms", []):
                for s in form.get("strengths", []):
                    if s.get("strength","").lower().replace(" ","") == target:
                        matched_ndc = s.get("ndcRepresented")
                        break

        records = []
        for result in results:
            pricing = result.get("pharmacyPricing", {})
            day_supply = pricing.get("daySupply", [])
            retail = pricing.get("estimatedRetailPrice")
            price = float(day_supply[0].get("price", 0)) if day_supply else (float(retail) if retail else 0)
            if price <= 0:
                continue
            records.append({
                "drug_name": drug_name, "strength": strength,
                "ndc": pricing.get("ndcSelected") or matched_ndc,
                "quantity": quantity, "zip_code": pharmacy["zip"],
                "pharmacy_name": pharmacy["name"], "pharmacy_chain": pharmacy["chain"],
                "cash_price": price, "coupon_price": price, "source": "buzzintegrations"
            })
        return records
    except Exception as e:
        log.warning(f"Scrape error {drug_name} @ {pharmacy["name"]}: {e}")
        return []

def post_price(record):
    try:
        r = requests.post(WORKER_URL + "/api/retail-price", json=record, timeout=10)
        return r.status_code == 200
    except Exception as e:
        log.warning(f"POST error: {e}")
        return False

def main():
    drugs = TIER_1_DAILY
    log.info(f"[{WORKER_ID}] Starting — {len(drugs)} drugs x {len(QUANTITIES)} quantities")

    total = 0
    for drug_name, strength in drugs:
        for qty in QUANTITIES:
            records = buzz_scrape(drug_name, strength, qty, "76102")
            for rec in records:
                # Skip brand-only pricing (generics should be < $500)
                if float(rec.get('cash_price', 0)) > 500:
                    continue
                if post_price(rec):
                    total += 1
            time.sleep(1)
        log.info(f"[{WORKER_ID}] {drug_name}: {total} total inserted so far")

    log.info(f"[{WORKER_ID}] Done. Total inserted: {total}")

if __name__ == "__main__":
    main()
