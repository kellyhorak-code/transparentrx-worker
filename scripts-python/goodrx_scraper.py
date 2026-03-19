import requests, random, time

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
]

def fetch_goodrx(drug):
    headers = {
        "User-Agent": random.choice(USER_AGENTS)
    }

    url = f"https://www.goodrx.com/{drug}"

    r = requests.get(url, headers=headers)
    html = r.text

    prices = []

    # 🔥 crude extraction (replace later with parser)
    if "Walmart" in html:
        prices.append({"name":"Walmart","price":9})
    if "Walgreens" in html:
        prices.append({"name":"Walgreens","price":15})

    time.sleep(random.uniform(2,5))

    return prices