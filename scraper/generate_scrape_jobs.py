"""
generate_scrape_jobs.py

Tiered job generator for TransparentRx scraping pipeline.

Tiers:
  DAILY   — scraped every 24 hours   (~500 drug/strength combos × zips)
  WEEKLY  — scraped every 7 days     (~500 drug/strength combos × zips)
  MONTHLY — scraped every 30 days    (~remaining combos × zips)

Run modes:
  python generate_scrape_jobs.py seed       # First-time: insert all jobs
  python generate_scrape_jobs.py daily      # Queue today's daily jobs
  python generate_scrape_jobs.py weekly     # Queue this week's jobs
  python generate_scrape_jobs.py monthly    # Queue this month's jobs
  python generate_scrape_jobs.py all        # Queue everything due now
"""

import sys
import requests
import time
from datetime import datetime, timedelta, timezone
from drug_catalog import get_all_drugs

WORKER_URL = "https://transparentrx-pricing.kellybhorak.workers.dev"

# ─────────────────────────────────────────────────────────────────────────────
# ZIP CODES — 30 markets for broad geographic coverage
# ─────────────────────────────────────────────────────────────────────────────

ZIPS = [
    # Texas
    "76102",  # Fort Worth
    "75201",  # Dallas
    "77001",  # Houston
    "78201",  # San Antonio
    "78701",  # Austin
    "79901",  # El Paso
    # Northeast
    "10001",  # New York
    "02101",  # Boston
    "19103",  # Philadelphia
    "06101",  # Hartford
    "21201",  # Baltimore
    "10301",  # Staten Island
    # Southeast
    "33101",  # Miami
    "30301",  # Atlanta
    "28201",  # Charlotte
    "37201",  # Nashville
    "35203",  # Birmingham
    "29201",  # Columbia SC
    # Midwest
    "60601",  # Chicago
    "44101",  # Cleveland
    "43201",  # Columbus
    "48201",  # Detroit
    "55401",  # Minneapolis
    "63101",  # St. Louis
    # West
    "90001",  # Los Angeles
    "94101",  # San Francisco
    "98101",  # Seattle
    "85001",  # Phoenix
    "80201",  # Denver
    "97201",  # Portland
]

QUANTITIES = [30, 90]  # 2 qty per zip keeps volume manageable; add 60 later if needed

REFRESH_INTERVALS = {
    "daily":   timedelta(hours=24),
    "weekly":  timedelta(days=7),
    "monthly": timedelta(days=30),
}


def submit_job(job: dict) -> bool:
    try:
        r = requests.post(
            WORKER_URL + "/api/create-job",
            json=job,
            timeout=10,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"  POST error: {e}")
        return False


def queue_tier(tier: str, dry_run: bool = False):
    all_drugs = get_all_drugs()
    drugs = [(d, s) for d, s, t in all_drugs if t == tier]

    jobs = []
    for drug, strength in drugs:
        for qty in QUANTITIES:
            for zip_code in ZIPS:
                jobs.append({
                    "drug_name": drug,
                    "strength":  strength,
                    "quantity":  qty,
                    "zip_code":  zip_code,
                    "tier":      tier,
                })

    print(f"\n[{tier.upper()}] {len(drugs)} drug combos × {len(QUANTITIES)} qty × {len(ZIPS)} zips = {len(jobs)} jobs")

    if dry_run:
        print(f"  DRY RUN — not submitting")
        return len(jobs)

    submitted = 0
    errors = 0

    for i, job in enumerate(jobs):
        if submit_job(job):
            submitted += 1
        else:
            errors += 1

        time.sleep(0.03)  # ~33 jobs/sec, avoids worker overload

        if (i + 1) % 500 == 0:
            print(f"  {i+1}/{len(jobs)} submitted...")

    print(f"  Done — submitted: {submitted}, errors: {errors}")
    return submitted


def seed_all():
    """First-time seed — queues ALL tiers."""
    print("=" * 60)
    print("SEEDING ALL TIERS")
    print("=" * 60)
    total = 0
    for tier in ["daily", "weekly", "monthly"]:
        total += queue_tier(tier)
    print(f"\nTotal jobs submitted: {total}")


def queue_daily():
    print("Queueing DAILY refresh jobs...")
    queue_tier("daily")


def queue_weekly():
    print("Queueing WEEKLY refresh jobs...")
    queue_tier("weekly")


def queue_monthly():
    print("Queueing MONTHLY refresh jobs...")
    queue_tier("monthly")


def stats():
    all_drugs = get_all_drugs()
    daily   = [(d, s) for d, s, t in all_drugs if t == "daily"]
    weekly  = [(d, s) for d, s, t in all_drugs if t == "weekly"]
    monthly = [(d, s) for d, s, t in all_drugs if t == "monthly"]

    print("\n=== TransparentRx Drug Catalog Stats ===")
    print(f"  Tier 1 DAILY   drug/strength combos: {len(daily)}")
    print(f"  Tier 2 WEEKLY  drug/strength combos: {len(weekly)}")
    print(f"  Tier 3 MONTHLY drug/strength combos: {len(monthly)}")
    print(f"  Total drug/strength combos:          {len(all_drugs)}")
    print()
    print(f"  ZIP codes: {len(ZIPS)}")
    print(f"  Quantities per drug: {QUANTITIES}")
    print()

    def job_count(drugs):
        return len(drugs) * len(QUANTITIES) * len(ZIPS)

    print(f"  Daily   jobs per run: {job_count(daily):,}")
    print(f"  Weekly  jobs per run: {job_count(weekly):,}")
    print(f"  Monthly jobs per run: {job_count(monthly):,}")
    print()
    print(f"  Daily   prices collected (est. 15/job):  {job_count(daily)*15:,}")
    print(f"  Weekly  prices collected (est. 15/job):  {job_count(weekly)*15:,}")
    print(f"  Monthly prices collected (est. 15/job):  {job_count(monthly)*15:,}")
    print(f"  Annual price observations (est):         {(job_count(daily)*365 + job_count(weekly)*52 + job_count(monthly)*12)*15:,}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "stats"

    if mode == "seed":
        seed_all()
    elif mode == "daily":
        queue_daily()
    elif mode == "weekly":
        queue_weekly()
    elif mode == "monthly":
        queue_monthly()
    elif mode == "stats":
        stats()
    else:
        print(f"Unknown mode: {mode}")
        print("Usage: python generate_scrape_jobs.py [seed|daily|weekly|monthly|stats]")