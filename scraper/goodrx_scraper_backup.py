"""
goodrx_scraper.py
GoodRx scraper using Apify actor
"""

import os
import time
import logging
import requests
from datetime import datetime

log = logging.getLogger(__name__)

APIFY_TOKEN = os.environ["APIFY_TOKEN"]

ACTOR_ID = "muscular_quadruplet~goodrx-drug-price-scraper"
BASE_URL = "https://api.apify.com/v2"


GOODRX_QTY_MAP = {
    15: 15,
    20: 20,
    30: 30,
    45: 45,
    60: 60,
    90: 90,
    100: 100,
}


def _nearest_goodrx_qty(quantity: int) -> int:
    buckets = sorted(GOODRX_QTY_MAP.keys())
    return min(buckets, key=lambda b: abs(b - quantity))


def scrape_goodrx(job: dict) -> list[dict]:

    drug_name = job["drug_name"]
    strength = job["strength"]
    quantity = job["quantity"]
    zip_code = job["zip_code"]

    scraped_at = datetime.utcnow().isoformat()
    goodrx_qty = _nearest_goodrx_qty(quantity)

    run_input = {
        "drugName": drug_name.lower(),
        "strength": strength,
        "quantity": goodrx_qty,
        "zipCode": zip_code,
        "form": "tablet",
    }

    try:

        start_resp = requests.post(
            f"{BASE_URL}/acts/{ACTOR_ID}/runs",
            headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
            json={"input": run_input, "memory": 512},
            timeout=30,
        )

        start_resp.raise_for_status()

        run_id = start_resp.json()["data"]["id"]

    except Exception as e:

        log.error(f"GoodRx start failed: {e}")
        return []

    for _ in range(24):

        time.sleep(5)

        try:

            status_resp = requests.get(
                f"{BASE_URL}/acts/{ACTOR_ID}/runs/{run_id}",
                headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
                timeout=15,
            )

            status = status_resp.json()["data"]["status"]

            if status == "SUCCEEDED":
                break

            if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                return []

        except Exception:
            continue

    try:

        dataset_resp = requests.get(
            f"{BASE_URL}/acts/{ACTOR_ID}/runs/{run_id}/dataset/items",
            headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
            params={"format": "json", "clean": "true"},
            timeout=30,
        )

        dataset_resp.raise_for_status()

        items = dataset_resp.json()

    except Exception as e:

        log.error(f"GoodRx dataset fetch failed: {e}")
        return []

    if not items:
        return []

    records = []

    for item in items:

        pharmacy = (
            item.get("pharmacy")
            or item.get("pharmacyName")
            or item.get("pharmacy_name")
        )

        price = (
            item.get("price")
            or item.get("couponPrice")
            or item.get("goodrx_price")
        )

        if not pharmacy or price is None:
            continue

        try:
            price_float = float(str(price).replace("$", "").strip())
        except Exception:
            continue

        records.append({
            "drug_name": drug_name,
            "strength": strength,
            "quantity": goodrx_qty,
            "zip_code": zip_code,
            "pharmacy_name": pharmacy,
            "pharmacy_chain": _normalize_chain(pharmacy),
            "cash_price": price_float,
            "coupon_price": price_float,
            "price_type": "goodrx_coupon",
            "source": "goodrx",
            "scraped_at": scraped_at,
            "latitude": item.get("latitude"),
            "longitude": item.get("longitude"),
        })

    log.info(f"GoodRx {drug_name} {strength}: {len(records)} prices")

    return records


def _normalize_chain(pharmacy_name: str) -> str:

    name = pharmacy_name.lower()

    if "cvs" in name: return "cvs"
    if "walgreen" in name: return "walgreens"
    if "walmart" in name: return "walmart"
    if "kroger" in name: return "kroger"
    if "rite aid" in name: return "riteaid"
    if "costco" in name: return "costco"
    if "target" in name: return "target"
    if "publix" in name: return "publix"
    if "heb" in name or "h-e-b" in name: return "heb"

    return pharmacy_name.lower().replace(" ", "_")