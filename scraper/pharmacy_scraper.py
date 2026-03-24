from datetime import datetime, timezone
import requests
import time

BUZZ_API_KEY="RXCOMPARE:CVS:FINDPHARMACY-ONrcna4Uzv964t5jU30FHadhYdC97zkI3mQsvGel"
ALGOLIA_API_KEY="1b354bc455bd37f4ff732f8cd66c18f8"
ALGOLIA_APP_ID="TYCUDL9WWJ"

ALGOLIA_URL=f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/drug/query"
STRENGTHS_URL="https://api.buzzintegrations.com/private/services/v1/drugprice/bydrugnameid/bypharmacies"
MULTICARD_URL="https://api.buzzintegrations.com/rxcompare/multicard/price"

from cvs_scraper import get_token

def buzz_headers():
    return {
        "authorization": f"Bearer {get_token()}",
        "content-type": "application/json",
        "x-api-key": BUZZ_API_KEY,
        "origin": "https://cvs.rxcompare.com",
        "referer": "https://cvs.rxcompare.com/",
        "user-agent": "Mozilla/5.0"
    }

def search_drug(drug):
    r=requests.post(
        ALGOLIA_URL,
        headers={
            "x-algolia-api-key":ALGOLIA_API_KEY,
            "x-algolia-application-id":ALGOLIA_APP_ID
        },
        json={"query":drug}
    )
    hits=r.json().get("hits",[])
    if not hits:
        return None
    return str(hits[0]["drugNameID"])

def scrape(drug_name, strength, quantity, zip_code):
    npi = "1831293638"
    scraped_at = datetime.now(timezone.utc).isoformat()

    drug_name_id = search_drug(drug_name)
    if not drug_name_id:
        return []

    r = requests.post(
        STRENGTHS_URL,
        headers=buzz_headers(),
        json={
            "messageCode": "nnIWk4P2",
            "clientID": "RXCOMP-CVS",
            "drugParameters": {"drugNameID": drug_name_id},
            "location": {"npis": [npi]},
            "options": {"includeDrugDictionary": True}
        },
        timeout=15
    )

    data = r.json()
    price_data = data.get("data", {}).get("price", {})
    drug_dict = price_data.get("drugDictionary", [])
    results = price_data.get("results", [])

    # Find best matching NDC from drugDictionary
    matched_ndc = None
    matched_strength = strength
    target = strength.lower().replace(" ", "")

    for drug in drug_dict:
        for form in drug.get("forms", []):
            for s in form.get("strengths", []):
                s_norm = s.get("strength", "").lower().replace(" ", "")
                if s_norm == target or target in s_norm:
                    matched_ndc = s.get("ndcRepresented")
                    matched_strength = s.get("strength", strength)
                    break

    records = []

    for result in results:
        profile = result.get("pharmacyProfile", {})
        pricing = result.get("pharmacyPricing", {})
        pharmacy_name = profile.get("identifier", {}).get("name", "CVS PHARMACY")
        ndc_selected = pricing.get("ndcSelected") or matched_ndc
        day_supply = pricing.get("daySupply", [])
        retail_price = pricing.get("estimatedRetailPrice")

        if day_supply:
            price = float(day_supply[0].get("price", 0))
        elif retail_price:
            price = float(retail_price)
        else:
            continue

        if price <= 0:
            continue

        records.append({
            "drug_name": drug_name,
            "strength": matched_strength,
            "ndc": ndc_selected,
            "quantity": quantity,
            "zip_code": zip_code,
            "pharmacy_name": pharmacy_name,
            "pharmacy_chain": "cvs",
            "cash_price": price,
            "coupon_price": price,
            "price_type": "coupon",
            "source": "buzzintegrations",
            "scraped_at": scraped_at
        })

    return records
