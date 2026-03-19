import requests
import random
import time

WORKER_URL = "https://transparentrx-pricing.kellybhorak.workers.dev"

DRUGS = [
    ("lisinopril","20mg"),
    ("metformin","500mg"),
    ("atorvastatin","10mg"),
    ("amlodipine","5mg"),
    ("losartan","50mg"),
    ("gabapentin","300mg"),
    ("sertraline","50mg"),
    ("levothyroxine","50mcg"),
    ("omeprazole","20mg"),
    ("hydrochlorothiazide","25mg"),
]

QUANTITIES = [30,60,90]

ZIPS = [
"76102","10001","30301","60601","75201",
"85001","90001","98101","19103","33101"
]

print("Generating scrape jobs...")

jobs = []

for drug,strength in DRUGS:
    for qty in QUANTITIES:
        for zip_code in ZIPS:

            job = {
                "drug_name": drug,
                "strength": strength,
                "quantity": qty,
                "zip_code": zip_code
            }

            jobs.append(job)

print("Total jobs:",len(jobs))

for job in jobs:

    try:

        requests.post(
            WORKER_URL + "/api/create-job",
            json=job,
            timeout=5
        )

    except:
        pass

    time.sleep(0.05)

print("Jobs submitted")