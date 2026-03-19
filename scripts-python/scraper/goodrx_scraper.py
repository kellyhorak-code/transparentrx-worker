from playwright.sync_api import sync_playwright
import requests
import json

WORKER_URL = "https://transparentrx-pricing.kellybhorak.workers.dev/api/retail-price"

drug = "lisinopril"
dose = "20mg"
quantity = 30
zip_code = "76102"

url = f"https://www.goodrx.com/{drug}?dosage={dose}&form=tablet&quantity={quantity}&label_override={drug}"

def send_price(data):
    try:
        r = requests.post(WORKER_URL, json=data)
        print("sent:", r.status_code)
    except Exception as e:
        print("send error:", e)

with sync_playwright() as p:

    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    print("Loading page...")
    page.goto(url)

    page.wait_for_timeout(6000)

    pharmacies = page.evaluate("""
    () => {
        const rows = document.querySelectorAll('[data-test="pharmacy-row"]')
        const data = []

        rows.forEach(row => {

            const name = row.querySelector('[data-test="pharmacy-name"]')?.innerText
            const price = row.querySelector('[data-test="price"]')?.innerText

            if(name && price){
                data.push({
                    pharmacy:name,
                    price:price.replace(/[^0-9\\.]/g,'')
                })
            }

        })

        return data
    }
    """)

    browser.close()

for p in pharmacies:

    payload = {
        "ndc": "00054018113",
        "drug_name": drug,
        "strength": dose,
        "quantity": quantity,
        "pharmacy_name": p["pharmacy"],
        "pharmacy_chain": p["pharmacy"],
        "cash_price": float(p["price"]),
        "coupon_price": None,
        "zip_code": zip_code,
        "source": "goodrx"
    }

    print(payload)

    send_price(payload)