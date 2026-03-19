import time
import subprocess

print("TransparentRx Scraper Scheduler Started")

while True:
    print("Running price seed...")

    subprocess.run(["python3", "scraper/seed_prices.py"])

    print("Sleeping 6 hours before next scrape...")
    time.sleep(21600)