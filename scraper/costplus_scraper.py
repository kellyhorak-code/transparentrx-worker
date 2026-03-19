import requests

def scrape_costplus(job):

    drug = job["drug_name"].lower()
    strength = job["strength"]
    quantity = job["quantity"]

    url = "https://costplusdrugs.com/api/products"

    try:

        r = requests.get(url, timeout=10)
        r.raise_for_status()

        data = r.json()

        prices = []

        for p in data:

            name = p.get("name","").lower()

            if drug not in name:
                continue

            for pkg in p.get("packages",[]):

                if strength.replace(" ","") not in pkg.get("strength",""):
                    continue

                price = pkg.get("price")

                if not price:
                    continue

                prices.append({
                    "pharmacy_name":"Cost Plus Drugs",
                    "pharmacy_chain":"Cost Plus Drugs",
                    "cash_price":float(price),
                    "coupon_price":float(price),
                    "price_type":"cash",
                    "source":"costplus"
                })

        return prices

    except Exception as e:

        print("CostPlus error:", e)
        return []
