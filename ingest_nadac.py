import requests
import csv
from io import StringIO
import subprocess

URL = "https://data.medicaid.gov/resource/8k7x-4v9p.csv?$limit=500000"

def norm(x):
    return (x or "").lower().strip()

print("Downloading NADAC...")
r = requests.get(URL)
r.raise_for_status()

reader = csv.DictReader(StringIO(r.text))

batch = []
count = 0

for row in reader:
    try:
        drug = norm(row.get("ndc_description"))
        ndc = row.get("ndc")
        price = float(row.get("nadac_per_unit") or 0)

        if not drug or not ndc or price <= 0:
            continue

        batch.append((ndc, drug, price))
        count += 1

        if len(batch) >= 300:
            values = ",".join(f"('{n}','{d}',{p})" for n,d,p in batch)
            cmd = f"wrangler d1 execute transparentrx-ndc --command \"INSERT INTO nadac_prices (ndc, drug_key, price_per_unit) VALUES {values};\""
            subprocess.run(cmd, shell=True)
            batch = []

    except:
        continue

if batch:
    values = ",".join(f"('{n}','{d}',{p})" for n,d,p in batch)
    cmd = f"wrangler d1 execute transparentrx-ndc --command \"INSERT INTO nadac_prices (ndc, drug_key, price_per_unit) VALUES {values};\""
    subprocess.run(cmd, shell=True)

print("Inserted:", count)
