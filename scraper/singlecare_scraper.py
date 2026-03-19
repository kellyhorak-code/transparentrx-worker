import requests

def scrape_singlecare(job):

    drug = job["drug_name"]
    qty = job["quantity"]

    url = "https://www.singlecare.com/api/prices"

    params = {
        "drug": drug,
        "quantity": qty
    }

    prices = []

    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()

        for p in data.get("pharmacies", []):

            prices.append({
                "pharmacy_name": p.get("name", "SingleCare"),
                "cash_price": float(p.get("price", 0)),
                "source": "singlecare"
            })

    except:
        pass

    return prices