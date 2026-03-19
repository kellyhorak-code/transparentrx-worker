import requests
from goodrx_scraper import fetch_goodrx

WORKER_URL = "https://transparentrx-pricing.kellybhorak.workers.dev/api/import-retail"

DRUG_MAP = {
    "lisinopril": "06362952471",
    "atorvastatin": "00093209205"
}

def push(ndc, records):
    payload = [
        {
            "ndc": ndc,
            "pharmacy_name": r["name"],
            "cash_price": r["price"]
        }
        for r in records
    ]

    requests.post(WORKER_URL, json={"records": payload})

if __name__ == "__main__":
    for drug, ndc in DRUG_MAP.items():
        prices = fetch_goodrx(drug)
        push(ndc, prices)