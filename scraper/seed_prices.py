import os
from ndc_resolver import resolve_ndc
from ndc_resolver import resolve_ndc
from zip_codes import ZIP_CODES
"""
seed_prices.py
═══════════════════════════════════════════════════════════════════════════════
TransparentRX  —  Database Seed Script
One-shot price ingestion: bypasses the job queue entirely.
Run this ONCE to bootstrap the DB with a dense price dataset fast.

Strategy:
  1. CostPlus  — All ~800 catalog drugs (national price, no ZIP needed)
                 Fast direct API, 1–2 req/sec, no rate limits
  2. CVS/BuzzIntegrations — Top 200 drugs × 8 ZIPs × 30+90 day
                 Instant API, authenticated, returns 5 platforms simultaneously
  3. GoodRx    — Top 50 drugs × 10 ZIPs × 30+90 day (via Apify)
                 Slowest (Apify actor overhead), but covers all major chains

Total estimated run time:  ~45–90 minutes
Expected price records:    ~50,000–80,000

Usage:
  python seed_prices.py                         # all three sources
  python seed_prices.py --source costplus       # CostPlus only (5 mins)
  python seed_prices.py --source cvs            # CVS only (~20 mins)
  python seed_prices.py --source goodrx         # GoodRx only (~60 mins)
  python seed_prices.py --top 50                # only top 50 drugs per source
  python seed_prices.py --dry-run               # print jobs, don't scrape

Env vars:
  APIFY_TOKEN       — required for GoodRx (default: built-in token)
  WORKER_URL        — override the worker endpoint
  THREADS           — concurrency level (default: 8 for CVS, 3 for GoodRx)

═══════════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import json
import time
import logging
import argparse
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

# ── Scrapers ──
from costplus_scraper import scrape_costplus
from cvs_scraper       import scrape as scrape_cvs
from goodrx_scraper import scrape_goodrx
from pharmacy_scraper  import scrape_all_chains, scrape_chain, PHARMACY_CHAINS, CHAIN_ENABLED
from drug_catalog      import get_all_drugs

# ── Config ──
WORKER_URL  = os.environ.get("WORKER_URL", "https://transparentrx-pricing.kellybhorak.workers.dev")
INGEST_URL  = f"{WORKER_URL}/api/retail-price"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("seed_prices.log"),
    ],
)
log = logging.getLogger("seed")

# ── ZIP codes (geographic spread + high population) ──
SEED_ZIPS = [
    "10001",   # New York, NY
    "90001",   # Los Angeles, CA
    "60601",   # Chicago, IL
    "77001",   # Houston, TX
    "85001",   # Phoenix, AZ
    "19101",   # Philadelphia, PA
    "78201",   # San Antonio, TX
    "92101",   # San Diego, CA
    "75201",   # Dallas, TX
    "95101",   # San Jose, CA
    "76102",   # Fort Worth, TX  (home base)
    "30301",   # Atlanta, GA
]

# Shorter ZIP list for GoodRx (Apify is slow — keep to 6 for seeds)
GOODRX_ZIPS = ["10001", "90001", "60601", "77001", "76102", "30301"]


# ══════════════════════════════════════════════════════════════════════════════
#  INGEST
# ══════════════════════════════════════════════════════════════════════════════

_ingest_session = requests.Session()
_ingest_session.headers.update({"Content-Type": "application/json"})

def ingest_price(record: dict) -> bool:
    """POST a single price record to the worker's ingest endpoint.
    Normalizes field names from any scraper format."""

    # Normalize pharmacy name  (cvs_scraper used 'pharmacy', standard is 'pharmacy_name')
    pharmacy_name = (
        record.get("pharmacy_name") or
        record.get("pharmacy") or
        record.get("provider_name") or
        "unknown"
    )

    # Normalize price  (cvs_scraper used 'price', standard is 'cash_price')
    cash_price = (
        record.get("cash_price") or
        record.get("price") or
        record.get("coupon_price")
    )
    coupon_price = (
        record.get("coupon_price") or
        record.get("price") or
        cash_price
    )

    if not cash_price or float(cash_price) <= 0:
        log.warning(f"Skipping record with invalid price: {record.get('drug_name')} {cash_price}")
        return False

    payload = {
        "ndc":            record.get("ndc") or "00000000000",
        "drug_name":      record["drug_name"],
        "strength":       record.get("strength"),
        "quantity":       record.get("quantity"),
        "pharmacy_name":  pharmacy_name,
        "pharmacy_chain": record.get("pharmacy_chain") or pharmacy_name.lower().replace(" ", "_"),
        "cash_price":     float(cash_price),
        "coupon_price":   float(coupon_price),
        "price_type":     record.get("price_type", "coupon"),
        "zip_code":       record.get("zip_code"),
        "latitude":       record.get("latitude"),
        "longitude":      record.get("longitude"),
        "source":         record.get("source", "unknown"),
    }
    try:
        r = _ingest_session.post(INGEST_URL, json=payload, timeout=12)
        return r.status_code in (200, 201)
    except Exception as e:
        log.warning(f"Ingest failed: {e} | {record['drug_name']}")
        return False


def ingest_batch(records: list[dict], label: str = "") -> int:
    """Ingest a list of records. Returns success count."""
    ok = 0
    for rec in records:
        if ingest_price(rec):
            ok += 1
        else:
            log.warning(f"Failed to ingest: {rec['drug_name']} {rec.get('pharmacy_name','')}")
    if ok:
        log.info(f"  ✓ {ok}/{len(records)} ingested  {label}")
    return ok


# ══════════════════════════════════════════════════════════════════════════════
#  COSTPLUS SEED  —  All catalog drugs, fast, single thread is fine
# ══════════════════════════════════════════════════════════════════════════════

def seed_costplus(drugs: list, dry_run: bool = False) -> int:
    """
    Seed Cost Plus prices for all catalog drugs.
    CostPlus is a single national price — no ZIP variation needed.
    We run both 30-day and 90-day quantities.
    """
    log.info(f"\n{'═'*60}")
    log.info(f"  COST PLUS DRUGS  —  {len(drugs)} drug/strength combos")
    log.info(f"{'═'*60}\n")

    total_ingested = 0
    total_jobs     = 0

    for i, (drug_name, strength, tier) in enumerate(drugs):
        for qty in [30, 90]:
            total_jobs += 1
            if dry_run:
                print(f"  [DRY] CostPlus | {drug_name} {strength} qty={qty}")
                continue

            try:
                records = scrape_costplus(drug_name, strength, qty)
                if records:
                    ingested = ingest_batch(records, f"CostPlus | {drug_name} {strength} qty={qty}")
                    total_ingested += ingested
                    if i % 50 == 0 and i > 0:
                        log.info(f"  Progress: {i}/{len(drugs)} drugs | {total_ingested} prices ingested")
            except Exception as e:
                log.warning(f"CostPlus error {drug_name}: {e}")

            time.sleep(3)  # Be polite — CostPlus is free, don't hammer it

    log.info(f"\n  Cost Plus complete: {total_ingested} prices ingested from {total_jobs} jobs\n")
    return total_ingested


# ══════════════════════════════════════════════════════════════════════════════
#  CVS/BUZZINTEGRATIONS SEED  —  Fastest source, runs in parallel
# ══════════════════════════════════════════════════════════════════════════════

def _cvs_job(args) -> list[dict]:
    """Run a single CVS scrape job. Designed for thread pool."""
    drug_name, strength, qty, zip_code = args
    try:
        return scrape_cvs(drug_name, strength, qty, zip_code) or []
    except Exception as e:
        log.warning(f"CVS error {drug_name} {zip_code}: {e}")
        return []


def seed_cvs(drugs: list, zips: list = SEED_ZIPS, threads: int = 8, dry_run: bool = False) -> int:
    """
    Seed CVS/BuzzIntegrations prices for top drugs.
    Each call returns 5 platforms (SingleCare, WellRx, BuzzRx, Hippo, SaveRxCard).
    Runs in parallel — the BuzzIntegrations API is fast.
    """
    # Build job list: (drug, strength, qty, zip)
    jobs = []
    for drug_name, strength, tier in drugs:
        for qty in [30, 90]:
            for zip_code in zips:
                jobs.append((drug_name, strength, qty, zip_code))

    log.info(f"\n{'═'*60}")
    log.info(f"  CVS / BUZZINTEGRATIONS  —  {len(jobs)} jobs  ({threads} threads)")
    log.info(f"  Covers: SingleCare, WellRx, BuzzRx, Hippo, SaveRxCard @ CVS")
    log.info(f"{'═'*60}\n")

    if dry_run:
        for j in jobs[:5]:
            print(f"  [DRY] CVS | {j[0]} {j[1]} qty={j[2]} zip={j[3]}")
        print(f"  ... and {len(jobs)-5} more")
        return 0

    total_ingested = 0

    with ThreadPoolExecutor(max_workers=threads) as ex:
        futures = {ex.submit(_cvs_job, j): j for j in jobs}
        done = 0
        for future in as_completed(futures):
            done += 1
            job = futures[future]
            try:
                records = future.result()
                if records:
                    ingested = ingest_batch(records, f"CVS | {job[0]} {job[1]} qty={job[2]} zip={job[3]}")
                    total_ingested += ingested
            except Exception as e:
                log.warning(f"CVS thread error: {e}")
            if done % 100 == 0:
                log.info(f"  CVS progress: {done}/{len(jobs)} jobs | {total_ingested} prices")

    log.info(f"\n  CVS complete: {total_ingested} prices ingested from {len(jobs)} jobs\n")
    return total_ingested


# ══════════════════════════════════════════════════════════════════════════════
#  GOODRX SEED  —  Via Apify, slowest, but covers all major chains
# ══════════════════════════════════════════════════════════════════════════════

def _goodrx_job(args) -> list[dict]:
    drug_name, strength, qty, zip_code = args
    try:
        return scrape_goodrx(drug_name, strength, qty, zip_code) or []
    except Exception as e:
        log.warning(f"GoodRx error {drug_name} {zip_code}: {e}")
        return []


def seed_goodrx(drugs: list, zips: list = GOODRX_ZIPS, threads: int = 3, dry_run: bool = False) -> int:
    """
    Seed GoodRx prices via Apify.
    Limited to 3 concurrent threads — each run takes 30-60 seconds.
    GoodRx covers CVS, Walgreens, Walmart, Kroger, Rite Aid, Costco, etc.
    """
    jobs = []
    for drug_name, strength, tier in drugs:
        for qty in [30, 90]:
            for zip_code in zips:
                jobs.append((drug_name, strength, qty, zip_code))

    log.info(f"\n{'═'*60}")
    log.info(f"  GOODRX (Apify)  —  {len(jobs)} jobs  ({threads} threads)")
    log.info(f"  Est. time: {len(jobs) * 45 // threads // 60} minutes")
    log.info(f"{'═'*60}\n")

    if dry_run:
        for j in jobs[:5]:
            print(f"  [DRY] GoodRx | {j[0]} {j[1]} qty={j[2]} zip={j[3]}")
        print(f"  ... and {len(jobs)-5} more")
        return 0

    total_ingested = 0

    with ThreadPoolExecutor(max_workers=threads) as ex:
        futures = {ex.submit(_goodrx_job, j): j for j in jobs}
        done = 0
        for future in as_completed(futures):
            done += 1
            job = futures[future]
            try:
                records = future.result()
                if records:
                    ingested = ingest_batch(records, f"GoodRx | {job[0]} {job[1]} qty={job[2]} zip={job[3]}")
                    total_ingested += ingested
            except Exception as e:
                log.warning(f"GoodRx thread error: {e}")
            if done % 20 == 0:
                log.info(f"  GoodRx progress: {done}/{len(jobs)} | {total_ingested} prices")

    log.info(f"\n  GoodRx complete: {total_ingested} prices ingested from {len(jobs)} jobs\n")
    return total_ingested


# ══════════════════════════════════════════════════════════════════════════════
#  GROCERY / WAREHOUSE PHARMACY SEED  —  Walmart, Kroger, HEB, Costco, Sam's
#  Same BuzzIntegrations API as CVS, different NPIs per chain.
#  Runs sequentially per chain to avoid hammering the API.
# ══════════════════════════════════════════════════════════════════════════════

def _pharmacy_job(args) -> list[dict]:
    """Run a single pharmacy scrape job. Designed for thread pool."""
    chain_key, drug_name, strength, qty, zip_code = args
    try:
        return scrape_chain(chain_key, drug_name, strength, qty, zip_code) or []
    except Exception as e:
        log.warning(f"Pharmacy error {chain_key}/{drug_name}/{zip_code}: {e}")
        return []


def seed_grocery_pharmacies(
    drugs:   list,
    zips:    list    = SEED_ZIPS,
    chains:  list    = None,
    threads: int     = 6,
    dry_run: bool    = False,
) -> int:
    """
    Seed all grocery/warehouse pharmacy chains via BuzzIntegrations.
    Chains: walmart, kroger, heb, costco, sams_club (excludes cvs — already seeded).

    HEB is TX-only — non-TX ZIPs return [] and are skipped automatically.
    Costco/Sam's Club require membership but prices are on the network.
    """
    if chains is None:
        chains = [k for k in CHAIN_ENABLED if k != "cvs" and CHAIN_ENABLED[k]]

    # Build job list: (chain, drug, strength, qty, zip)
    jobs = []
    for chain_key in chains:
        for drug_name, strength, tier in drugs:
            for qty in [30, 90]:
                for zip_code in zips:
                    jobs.append((chain_key, drug_name, strength, qty, zip_code))

    chain_labels = ", ".join(
        PHARMACY_CHAINS[c]["display_name"] for c in chains if c in PHARMACY_CHAINS
    )

    log.info(f"\n{'═'*60}")
    log.info(f"  GROCERY PHARMACIES  —  {len(jobs)} jobs  ({threads} threads)")
    log.info(f"  Chains:  {chain_labels}")
    log.info(f"  Drugs:   {len(drugs)}  |  ZIPs: {len(zips)}  |  Quantities: 2")
    log.info(f"{'═'*60}\n")

    if dry_run:
        for j in jobs[:5]:
            print(f"  [DRY] {j[0]:15s} | {j[1]} {j[2]} qty={j[3]} zip={j[4]}")
        print(f"  ... and {len(jobs)-5} more")
        return 0

    total_ingested = 0

    with ThreadPoolExecutor(max_workers=threads) as ex:
        futures = {ex.submit(_pharmacy_job, j): j for j in jobs}
        done    = 0
        for future in as_completed(futures):
            done += 1
            job = futures[future]
            try:
                records = future.result()
                if records:
                    label = f"{job[0]:12s} | {job[1]} {job[2]} qty={job[3]} zip={job[4]}"
                    ingested = ingest_batch(records, label)
                    total_ingested += ingested
            except Exception as e:
                log.warning(f"Pharmacy thread error: {e}")
            if done % 100 == 0:
                pct = done / len(jobs) * 100
                log.info(f"  Grocery progress: {done}/{len(jobs)} ({pct:.0f}%) | {total_ingested} prices")

    log.info(f"\n  Grocery pharmacies complete: {total_ingested} prices from {len(jobs)} jobs\n")
    return total_ingested


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Seed the TransparentRX database with initial price data"
    )
    parser.add_argument("--source",  choices=["costplus", "cvs", "goodrx", "grocery", "all"], default="all",
                        help="Which source to seed (default: all)")
    parser.add_argument("--chains",  nargs="+", default=None,
                        help="Grocery chains to seed (default: all). e.g. --chains walmart kroger heb")
    parser.add_argument("--top",     type=int, default=None,
                        help="Limit to top N drugs (by tier order)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print jobs without scraping")
    parser.add_argument("--threads", type=int, default=None,
                        help="Override thread count")
    args = parser.parse_args()

    # ── Load drug catalog ──
    all_drugs = get_all_drugs()  # [(name, strength, tier), ...]
    daily  = [d for d in all_drugs if d[2] == "daily"]
    weekly = [d for d in all_drugs if d[2] == "weekly"]

    # CostPlus: all drugs (they have a wide catalog)
    costplus_drugs = daily + weekly
    if args.top:
        costplus_drugs = costplus_drugs[:args.top]

    # CVS: top daily + first 100 weekly
    cvs_drugs = daily[:200] + weekly[:100]
    if args.top:
        cvs_drugs = cvs_drugs[:args.top]

    # GoodRx: top 50 daily (Apify is slow)
    goodrx_drugs = daily[:50]
    if args.top:
        goodrx_drugs = goodrx_drugs[:args.top]

    log.info(f"""
╔══════════════════════════════════════════════════════════╗
║  TransparentRX  —  Database Seed                        ║
╠══════════════════════════════════════════════════════════╣
║  Worker:  {WORKER_URL:<45s}║
║  Source:  {args.source:<45s}║
║  Dry run: {str(args.dry_run):<45s}║
╚══════════════════════════════════════════════════════════╝

  Catalog loaded:
    Daily drugs:     {len(daily)}
    Weekly drugs:    {len(weekly)}
    Total:           {len(all_drugs)}
""")

    start    = time.time()
    total_in = 0

    try:
        # ── Cost Plus ──
        if args.source in ("costplus", "all"):
            log.info(f"Starting CostPlus seed: {len(costplus_drugs)} drugs × 2 quantities")
            n = seed_costplus(costplus_drugs, dry_run=args.dry_run)
            total_in += n

        # ── CVS / BuzzIntegrations ──
        if args.source in ("cvs", "all"):
            threads = args.threads or 8
            log.info(f"Starting CVS seed: {len(cvs_drugs)} drugs × {len(SEED_ZIPS)} ZIPs × 2 quantities")
            n = seed_cvs(cvs_drugs, SEED_ZIPS, threads=threads, dry_run=args.dry_run)
            total_in += n

        # ── Grocery / Warehouse Pharmacies ──
        if args.source in ("grocery", "all"):
            threads = args.threads or 6
            grocery_drugs = daily[:200] + weekly[:100]
            if args.top:
                grocery_drugs = grocery_drugs[:args.top]
            chains = args.chains  # None = all enabled chains
            log.info(f"Starting grocery pharmacy seed: {len(grocery_drugs)} drugs × {len(SEED_ZIPS)} ZIPs × 2 qtys")
            n = seed_grocery_pharmacies(grocery_drugs, SEED_ZIPS, chains=chains,
                                        threads=threads, dry_run=args.dry_run)
            total_in += n

        # ── GoodRx ──
        if args.source in ("goodrx", "all"):
            threads = args.threads or 3
            log.info(f"Starting GoodRx seed: {len(goodrx_drugs)} drugs × {len(GOODRX_ZIPS)} ZIPs × 2 quantities")
            n = seed_goodrx(goodrx_drugs, GOODRX_ZIPS, threads=threads, dry_run=args.dry_run)
            total_in += n

    except KeyboardInterrupt:
        log.info("\nInterrupted — partial seed complete")

    elapsed = time.time() - start
    log.info(f"""
╔══════════════════════════════════════════════════════════╗
║  Seed Complete                                          ║
╠══════════════════════════════════════════════════════════╣
║  Total prices ingested: {total_in:<34d}║
║  Elapsed:               {f'{elapsed/60:.1f} minutes':<34s}║
╚══════════════════════════════════════════════════════════╝
""")

    if not args.dry_run and total_in > 0:
        log.info("Next steps:")
        log.info("  1. Check DB: wrangler d1 execute transparentrx-ndc --command 'SELECT COUNT(*) FROM retail_prices'")
        log.info("  2. Verify search: curl https://transparentrx-pricing.kellybhorak.workers.dev/api/search?q=lisinopril")
        log.info("  3. Test price: curl -X POST .../api/price -d '{\"ndc\":\"...\"}'")
        log.info("  4. Set up cron: crontab -e  →  add schedules from scheduler.py")


if __name__ == "__main__":
    main()