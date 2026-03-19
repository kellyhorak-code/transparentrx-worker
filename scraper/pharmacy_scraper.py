from datetime import datetime, timezone
import requests
import time

BUZZ_API_KEY="RXCOMPARE:CVS:FINDPHARMACY-ONrcna4Uzv964t5jU30FHadhYdC97zkI3mQsvGel"
ALGOLIA_API_KEY="1b354bc455bd37f4ff732f8cd66c18f8"
ALGOLIA_APP_ID="TYCUDL9WWJ"

ALGOLIA_URL=f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/drug/query"
STRENGTHS_URL="https://api.buzzintegrations.com/private/services/v1/drugprice/bydrugnameid/bypharmacies"
MULTICARD_URL="https://api.buzzintegrations.com/rxcompare/multicard/price"

BEARER_TOKEN="YOUR_TOKEN_HERE"

def buzz_headers():
    return {
        "authorization": f"Bearer {BEARER_TOKEN}",
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

def get_strengths(drug_name_id,npi):

    r=requests.post(
        STRENGTHS_URL,
        headers=buzz_headers(),
        json={
            "messageCode":"nnIWk4P2",
            "clientID":"RXCOMP-CVS",
            "drugParameters":{"drugNameID":drug_name_id},
            "location":{"npis":[npi]}
        }
    )

    data=r.json()
    drug_dict=data.get("data",{}).get("price",{}).get("drugDictionary",[])
    strengths=[]

    for drug in drug_dict:
        for form in drug.get("forms",[]):
            for s in form.get("strengths",[]):

                strengths.append({
                    "strength":s.get("strength"),
                    "drugFormStrengthID":str(s.get("drugFormStrengthID")),
                    "ndc":s.get("ndcRepresented"),
                    "quantities":[q["quantity"] for q in s.get("quantities",[])]
                })

    return strengths

def get_prices(drugFormStrengthID,qty,npi,zip_code):

    r=requests.post(
        MULTICARD_URL,
        headers=buzz_headers(),
        json={
            "pharmacyNPI":npi,
            "pharmacyZipCode":zip_code,
            "drugFormStrengthID":drugFormStrengthID,
            "drugQuantity":str(qty),
            "messageCode":"?BIXy{^AHVY!e%yUXzsBF24KX(oN"
        }
    )

    results=r.json().get("results",[])
    prices=[]

    for p in results:
        provider=p.get("provider",{})
        price=p.get("price")

        if price:
            prices.append({
                "provider":provider.get("participantDisplayName","unknown"),
                "price":float(price)
            })

    return prices

def scrape(drug_name,strength,quantity,zip_code):

    npi="1831293638"

    drug_name_id=search_drug(drug_name)
    if not drug_name_id:
        return []

    strengths=get_strengths(drug_name_id,npi)

    target=strength.lower()
    if not strengths:
        return []

    match=strengths[0]

    for s in strengths:
        if s["strength"].lower()==target:
            match=s

    prices=get_prices(match["drugFormStrengthID"],quantity,npi,zip_code)

    scraped_at=datetime.now(timezone.utc).isoformat()

    records=[]

    for p in prices:

        records.append({
            "drug_name":drug_name,
            "strength":match["strength"],
            "ndc":match["ndc"],
            "quantity":quantity,
            "zip_code":zip_code,
            "pharmacy_name":f"CVS ({p['provider']})",
            "pharmacy_chain":"cvs",
            "cash_price":p["price"],
            "coupon_price":p["price"],
            "price_type":"coupon",
            "source":"buzzintegrations",
            "latitude":None,
            "longitude":None,
            "scraped_at":scraped_at
        })

    return records
