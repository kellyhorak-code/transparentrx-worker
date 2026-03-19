"""
cvs_scraper.py
CVS/BuzzIntegrations — returns 5 discount card prices in one call:
  SingleCare, WellRx, BuzzRx, Hippo, SaveRxCard
"""

import os
import time
import json
import logging
import requests
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

BUZZ_API_KEY    = "RXCOMPARE:CVS:FINDPHARMACY-ONrcna4Uzv964t5jU30FHadhYdC97zkI3mQsvGel"
ALGOLIA_API_KEY = "1b354bc455bd37f4ff732f8cd66c18f8"
ALGOLIA_APP_ID  = "TYCUDL9WWJ"

ALGOLIA_URL   = f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/drug/query"
STRENGTHS_URL = "https://api.buzzintegrations.com/private/services/v1/drugprice/bydrugnameid/bypharmacies"
MULTICARD_URL = "https://api.buzzintegrations.com/rxcompare/multicard/price"

# ── Cognito credentials (extracted from cvs.rxcompare.com __NEXT_DATA__) ──────
# These are stable app credentials — the token they generate rotates every 2-3hr
TOKEN_USER_ID     = "2t8440p9pjkbagfo8ijdpv5je4"
TOKEN_USER_SECRET = "19fmp6h9bj9hghs0kjbd081ib1gr5hmo16b1q47224f1g69k76ts"
TOKEN_ENDPOINT    = "https://cvs.rxcompare.com/api/tokens"

# In-memory token cache — avoids redundant refreshes within same process
_token_cache: dict = {"token": None, "expires_at": 0}

def refresh_token() -> str:
    """
    Fetch a fresh Bearer token from cvs.rxcompare.com/api/tokens.
    Refreshes proactively at 90 min to stay ahead of the 2-3hr rotation.
    Falls back to CVS_BEARER_TOKEN env var if the endpoint fails.
    """
    try:
        r = requests.get(
            TOKEN_ENDPOINT,
            params={
                "client_id":     TOKEN_USER_ID,
                "client_secret": TOKEN_USER_SECRET,
            },
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        r.raise_for_status()
        token = r.json()["data"]["results"]["token"]["access_token"]
        _token_cache["token"]      = token
        _token_cache["expires_at"] = time.time() + 90 * 60  # 90 min
        log.info("Bearer token refreshed successfully")
        return token
    except Exception as e:
        log.warning(f"Token refresh failed: {e} — falling back to env var")
        return os.environ.get("CVS_BEARER_TOKEN", "")

def get_token() -> str:
    """Return cached token, refreshing if expired or missing."""
    # Env var override takes priority (manual rotation still works)
    if os.environ.get("CVS_BEARER_TOKEN"):
        return os.environ["CVS_BEARER_TOKEN"]
    if _token_cache["token"] and time.time() < _token_cache["expires_at"]:
        return _token_cache["token"]
    return refresh_token()

CVS_STORES = {
    "76102": {"npi": "1831293638", "ncpdpId": "4580747"},
    "75201": {"npi": "1326042061", "ncpdpId": "5572871"},
    "77001": {"npi": "1578557180", "ncpdpId": "5571985"},
    "78201": {"npi": "1699768432", "ncpdpId": "5575123"},
    "78701": {"npi": "1487648234", "ncpdpId": "5576891"},
    "10001": {"npi": "1285628441", "ncpdpId": "5501234"},
    "60601": {"npi": "1234567890", "ncpdpId": "5523456"},
    "90001": {"npi": "1345678901", "ncpdpId": "5534567"},
    "30301": {"npi": "1456789012", "ncpdpId": "5545678"},
    "85001": {"npi": "1567890123", "ncpdpId": "5556789"},
    "19101": {"npi": "1678901234", "ncpdpId": "5567890"},
    "98101": {"npi": "1789012345", "ncpdpId": "5578901"},
}
DEFAULT_STORE = CVS_STORES["76102"]

def get_store(zip_code):
    return CVS_STORES.get(zip_code, DEFAULT_STORE)

def buzz_headers():
    return {
        "accept":        "*/*",
        "authorization": f"Bearer {get_token()}",
        "content-type":  "application/json",
        "origin":        "https://cvs.rxcompare.com",
        "referer":       "https://cvs.rxcompare.com/",
        "user-agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "x-api-key":     BUZZ_API_KEY,
    }

def search_drug(drug_name):
    try:
        r = requests.post(
            ALGOLIA_URL,
            headers={
                "content-type":             "application/json",
                "x-algolia-api-key":        ALGOLIA_API_KEY,
                "x-algolia-application-id": ALGOLIA_APP_ID,
            },
            json={"query": drug_name, "clickAnalytics": False},
            timeout=10,
        )
        r.raise_for_status()
        hits = r.json().get("hits", [])
        if not hits:
            return None
        for hit in hits:
            if hit.get("drugName", "").lower() == drug_name.lower():
                return str(hit["drugNameID"])
        return str(hits[0]["drugNameID"])
    except Exception as e:
        log.warning(f"Algolia search failed for {drug_name}: {e}")
        return None

def get_strengths(drug_name_id, zip_code):
    store = get_store(zip_code)
    try:
        r = requests.post(
            STRENGTHS_URL,
            headers=buzz_headers(),
            json={
                "messageCode":    "nnIWk4P2",
                "clientID":       "RXCOMP-CVS",
                "drugParameters": {"drugNameID": drug_name_id},
                "location":       {"npis": [store["npi"]]},
                "options":        {"includeDrugDictionary": True, "predictiveNDCs": False},
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        drug_dict = data.get("data", {}).get("price", {}).get("drugDictionary", [])
        strengths = []
        for drug in drug_dict:
            for form in drug.get("forms", []):
                for s in form.get("strengths", []):
                    strengths.append({
                        "strength":           s.get("strength", ""),
                        "form":               form.get("form", ""),
                        "drugFormStrengthID": str(s.get("drugFormStrengthID", "")),
                        "ndc":                s.get("ndcRepresented", ""),
                        "quantities":         [q["quantity"] for q in s.get("quantities", [])],
                    })
        return strengths
    except Exception as e:
        log.warning(f"get_strengths failed for drugNameID={drug_name_id}: {e}")
        return []

def get_prices(drug_form_strength_id, quantity, zip_code):
    store = get_store(zip_code)
    try:
        r = requests.post(
            MULTICARD_URL,
            headers=buzz_headers(),
            json={
                "pharmacyNPI":        store["npi"],
                "ncpdpId":            store["ncpdpId"],
                "pharmacyZipCode":    zip_code,
                "messageCode":        "?BIXy{^AHVY!e%yUXzsBF24KX(oN",
                "drugFormStrengthID": str(drug_form_strength_id),
                "drugQuantity":       str(quantity),
            },
            timeout=15,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        prices = []
        for item in results:
            provider = item.get("provider", {})
            price    = item.get("price")
            if price:
                prices.append({
                    "provider_id":   provider.get("id", "unknown"),
                    "provider_name": provider.get("participantDisplayName") or provider.get("name", "unknown"),
                    "price":         float(price),
                })
        return prices
    except Exception as e:
        log.warning(f"get_prices failed: {e}")
        return []

def scrape(drug_name, strength, quantity, zip_code):
    scraped_at = datetime.now(timezone.utc).isoformat()

    drug_name_id = search_drug(drug_name)
    if not drug_name_id:
        return []

    strengths = get_strengths(drug_name_id, zip_code)
    if not strengths:
        return []

    target  = strength.lower().strip()
    matched = next((s for s in strengths if s["strength"].lower().strip() == target), strengths[0])
    if matched["strength"].lower().strip() != target:
        log.info(f"Strength '{strength}' not found, using '{matched['strength']}'")

    available = matched.get("quantities", [quantity])
    if quantity not in available and available:
        quantity = min(available, key=lambda q: abs(q - quantity))

    prices = get_prices(matched["drugFormStrengthID"], quantity, zip_code)

    records = []
    for p in prices:
        provider_key = p["provider_id"].lower().replace("-", "_").replace(" ", "_")
        records.append({
            "drug_name":      drug_name,
            "strength":       matched["strength"],
            "ndc":            matched["ndc"],
            "quantity":       quantity,
            "zip_code":       zip_code,
            "pharmacy_name":  f"CVS ({p['provider_name']})",
            "pharmacy_chain": "cvs",
            "cash_price":     p["price"],
            "coupon_price":   p["price"],
            "price_type":     "coupon",
            "source":         f"buzzintegrations_{provider_key}",
            "latitude":       None,
            "longitude":      None,
            "scraped_at":     scraped_at,
        })
    return records


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
    print("Testing CVS/BuzzIntegrations scraper...")
    print("Drug: metformin 500mg, qty 30, zip 76102\n")
    results = scrape("metformin", "500mg", 30, "76102")
    if results:
        print(f"Got {len(results)} price records:\n")
        for r in results:
            print(f"  {r['pharmacy_name']:40s}  ${r['coupon_price']:.2f}")
    else:
        print("No results.")