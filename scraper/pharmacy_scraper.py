from datetime import datetime, timezone
import requests
import time
from cvs_scraper import get_token

BUZZ_API_KEY="RXCOMPARE:CVS:FINDPHARMACY-ONrcna4Uzv964t5jU30FHadhYdC97zkI3mQsvGel"
ALGOLIA_API_KEY="1b354bc455bd37f4ff732f8cd66c18f8"
ALGOLIA_APP_ID="TYCUDL9WWJ"

ALGOLIA_URL=f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/drug/query"
STRENGTHS_URL="https://api.buzzintegrations.com/private/services/v1/drugprice/bydrugnameid/bypharmacies"
MULTICARD_URL="https://api.buzzintegrations.com/rxcompare/multicard/price"

PHARMACY_CONFIGS = [
    # Original Fort Worth / DFW core
    {"npi": "1831293638", "ncpdp": "4580747", "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "76102"},
    {"npi": "1326042061", "ncpdp": "5572871", "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "75201"},
    {"npi": "1578557180", "ncpdp": "5571985", "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "77001"},
    {"npi": "1598009375", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "76105"},
    {"npi": "1831116946", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "75204"},
    {"npi": "1528317344", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "77007"},
    # High-density ZIP expansion
    {"npi": "1073605705", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "08701"},
    {"npi": "1508960329", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "77449"},
    {"npi": "1215475736", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "77449"},
    {"npi": "1841394657", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "78660"},
    {"npi": "1114051257", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "78660"},
    {"npi": "1346344173", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "77433"},
    {"npi": "1992746861", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "60629"},
    {"npi": "1013011824", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "77494"},
    {"npi": "1568997427", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "79936"},
    {"npi": "1811916828", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "79936"},
    {"npi": "1396849139", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "11385"},
    {"npi": "1376647206", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "30044"},
    {"npi": "1265459507", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "30044"},
    {"npi": "1396842795", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "77573"},
    {"npi": "1932585130", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "77573"},
    {"npi": "1851495642", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "78130"},
    {"npi": "1295753085", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "78130"},
    {"npi": "1265536015", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "11219"},
    {"npi": "1780002691", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "77479"},
    {"npi": "1174627004", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "30043"},
    {"npi": "1104920990", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "78666"},
    {"npi": "1649297821", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "78666"},
    {"npi": "1992182166", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "75035"},
    {"npi": "1902315666", "ncpdp": None,       "name": "Walmart Pharmacy", "chain": "walmart", "zip": "75035"},
    {"npi": "1992727697", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "91911"},
    {"npi": "1376647040", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "22193"},
    {"npi": "1093737603", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "95823"},
    {"npi": "1417807769", "ncpdp": None,       "name": "CVS Pharmacy",     "chain": "cvs",     "zip": "11233"},
]

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
    try:
        r = requests.post(ALGOLIA_URL, headers={
            "x-algolia-api-key": ALGOLIA_API_KEY,
            "x-algolia-application-id": ALGOLIA_APP_ID
        }, json={"query": drug}, timeout=10)
        hits = r.json().get("hits", [])
        if not hits:
            return None
        return str(hits[0]["drugNameID"])
    except Exception as e:
        import logging
        logging.warning(f"Algolia search failed for {drug}: {e}")
        return None

_drug_id_cache = {}

def scrape(drug_name, strength, quantity, zip_code):
    scraped_at = datetime.now(timezone.utc).isoformat()
    key = drug_name.lower()
    if key not in _drug_id_cache:
        _drug_id_cache[key] = search_drug(drug_name)
    drug_name_id = _drug_id_cache[key]
    if not drug_name_id:
        return []

    all_records = []

    for pharmacy in PHARMACY_CONFIGS:
        try:
            r = requests.post(STRENGTHS_URL, headers=buzz_headers(), json={
                "messageCode": "nnIWk4P2",
                "clientID": "RXCOMP-CVS",
                "drugParameters": {"drugNameID": drug_name_id},
                "location": {"npis": [pharmacy["npi"]]},
                "options": {"includeDrugDictionary": True}
            }, timeout=15)

            data = r.json()
            price_data = data.get("data", {}).get("price", {})
            drug_dict = price_data.get("drugDictionary", [])
            results = price_data.get("results", [])

            matched_ndc = None
            matched_strength = strength
            matched_dfsi = None
            target = strength.lower().replace(" ", "")

            for drug in drug_dict:
                for form in drug.get("forms", []):
                    for s in form.get("strengths", []):
                        s_norm = s.get("strength", "").lower().replace(" ", "")
                        if s_norm == target or target in s_norm:
                            matched_ndc = s.get("ndcRepresented")
                            matched_strength = s.get("strength", strength)
                            matched_dfsi = str(s.get("drugFormStrengthID"))
                            break

            for result in results:
                pricing = result.get("pharmacyPricing", {})
                ndc_selected = pricing.get("ndcSelected") or matched_ndc
                day_supply = pricing.get("daySupply", [])
                retail_price = pricing.get("estimatedRetailPrice")

                price = float(day_supply[0].get("price", 0)) if day_supply else (float(retail_price) if retail_price else 0)
                if price <= 0:
                    continue

                all_records.append({
                    "drug_name": drug_name, "strength": matched_strength,
                    "ndc": ndc_selected, "quantity": quantity,
                    "zip_code": pharmacy["zip"],
                    "pharmacy_name": pharmacy["name"],
                    "pharmacy_chain": pharmacy["chain"],
                    "cash_price": price, "coupon_price": price,
                    "price_type": "cash", "source": "buzzintegrations",
                    "scraped_at": scraped_at
                })

                if pharmacy["ncpdp"] and matched_dfsi:
                    try:
                        mc = requests.post(MULTICARD_URL, headers=buzz_headers(), json={
                            "pharmacyNPI": pharmacy["npi"],
                            "ncpdpId": pharmacy["ncpdp"],
                            "pharmacyZipCode": pharmacy["zip"],
                            "drugFormStrengthID": matched_dfsi,
                            "drugQuantity": str(quantity),
                            "messageCode": "?BIXy{^AHVY!e%yUXzsBF24KX(oN"
                        }, timeout=15)
                        for p in mc.json().get("results", []):
                            cp = float(p.get("price", 0))
                            provider = p.get("provider", {}).get("participantDisplayName", "")
                            if cp > 0 and provider:
                                all_records.append({
                                    "drug_name": drug_name, "strength": matched_strength,
                                    "ndc": ndc_selected, "quantity": quantity,
                                    "zip_code": pharmacy["zip"],
                                    "pharmacy_name": pharmacy["name"],
                                    "pharmacy_chain": pharmacy["chain"],
                                    "cash_price": cp, "coupon_price": cp,
                                    "price_type": "coupon", "source": provider,
                                    "scraped_at": scraped_at
                                })
                    except:
                        pass
        except:
            pass

    return all_records
