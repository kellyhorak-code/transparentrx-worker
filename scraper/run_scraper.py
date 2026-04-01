#!/usr/bin/env python3
"""
TransparentRx Scraper — Bulletproof Continuous Mode
Runs forever. Retries every error. Never stops.
Polls scrape_jobs for user-submitted drugs after every standard pass.
"""
import sys, os, time, uuid, logging, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from drug_catalog import TIER_1_DAILY
except ImportError:
    TIER_1_DAILY = [
        ("lisinopril","10mg"),("metformin","500mg"),("atorvastatin","20mg"),
        ("amlodipine","5mg"),("losartan","50mg"),("gabapentin","300mg"),
        ("omeprazole","20mg"),("levothyroxine","50mcg"),("hydrochlorothiazide","25mg"),
    ]

from pharmacy_scraper import scrape as buzz_scrape, PHARMACY_CONFIGS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

WORKER_URL   = "https://transparentrx-worker.kellybhorak.workers.dev"
QUANTITIES   = [30, 90]
POST_TIMEOUT = 30
RETRY_DELAY  = 5
LOOP_PAUSE   = 60

# Limit queued job scraping to these chains for speed
PRIORITY_PHARMACIES = [p for p in PHARMACY_CONFIGS if p.get('zip') in ('76102','77001','75201','90001','60601','10001','98101','85004','32201','78701')]
if not PRIORITY_PHARMACIES:
    PRIORITY_PHARMACIES = PHARMACY_CONFIGS[:20]

def post_price(record, session):
    try:
        r = session.post(WORKER_URL + "/api/retail-price", json=record, timeout=POST_TIMEOUT)
        return r.status_code == 200
    except Exception as e:
        log.warning(f"POST error: {e}")
        return False

def scrape_with_retry(drug_name, strength, qty, pharmacy, max_retries=3):
    for attempt in range(1, max_retries + 1):
        try:
            records = buzz_scrape(drug_name, strength, qty, pharmacy["zip"])
            return records
        except Exception as e:
            log.warning(f"Scrape attempt {attempt}/{max_retries} failed for {drug_name} @ {pharmacy['zip']}: {e}")
            if attempt < max_retries:
                time.sleep(RETRY_DELAY)
    return []

def mark_job_complete(job_id, session, status='complete'):
    try:
        session.post(
            WORKER_URL + "/api/scrape-jobs/complete",
            json={"id": job_id, "status": status},
            timeout=15
        )
    except Exception as e:
        log.warning(f"Could not mark job {job_id} complete: {e}")

def fetch_queued_jobs(session):
    """Fetch user-submitted drugs queued for scraping."""
    try:
        r = session.get(WORKER_URL + "/api/scrape-jobs", timeout=15)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        log.warning(f"Could not fetch scrape jobs: {e}")
    return []

def run_queued_jobs(session, run_id):
    """Process user-submitted drug queue — runs after every standard pass."""
    jobs = fetch_queued_jobs(session)
    if not jobs:
        log.info(f"[{run_id}] No queued jobs.")
        return 0

    log.info(f"[{run_id}] ── Queued Jobs: {len(jobs)} user-submitted drugs to scrape ──")
    total_inserted = 0

    for job in jobs:
        job_id   = job.get('id')
        drug_raw = (job.get('drug_name') or '').strip()
        zip_code = (job.get('zip_code') or '76102').strip()
        if not drug_raw:
            mark_job_complete(job_id, session, 'skipped')
            continue

        drug_name = drug_raw.lower()
        log.info(f"[{run_id}] Queued job: {drug_raw} @ {zip_code}")

        # Find pharmacies near the submitted ZIP, fall back to priority list
        zip_pharmacies = [p for p in PHARMACY_CONFIGS if p.get('zip') == zip_code]
        if not zip_pharmacies:
            zip_pharmacies = PRIORITY_PHARMACIES

        job_inserted = 0
        # Scrape 30-day only for quick initial data
        for pharmacy in zip_pharmacies[:15]:
            # Use empty strength — BuzzIntegrations handles strength lookup
            records = scrape_with_retry(drug_name, '', 30, pharmacy)
            for rec in records:
                try:
                    price = float(rec.get('cash_price', 0))
                except (ValueError, TypeError):
                    continue
                if price <= 0 or price > 500:
                    continue
                for _ in range(3):
                    if post_price(rec, session):
                        total_inserted += 1
                        job_inserted += 1
                        break
                    time.sleep(2)
            time.sleep(0.4)

        log.info(f"[{run_id}] Queued job {drug_raw}: {job_inserted} records inserted")
        mark_job_complete(job_id, session, 'complete' if job_inserted > 0 else 'no_data')

    log.info(f"[{run_id}] ── Queued jobs done: {total_inserted} total records inserted ──")
    return total_inserted

def run_pass(session, run_id):
    """Run one full pass through all standard catalog drugs."""
    drugs = TIER_1_DAILY
    total_inserted = 0
    total_attempted = 0

    log.info(f"[{run_id}] ── Starting pass: {len(drugs)} drugs × {len(QUANTITIES)} quantities × {len(PHARMACY_CONFIGS)} pharmacies ──")

    for drug_name, strength in drugs:
        drug_inserted = 0
        for qty in QUANTITIES:
            for pharmacy in PHARMACY_CONFIGS:
                records = scrape_with_retry(drug_name, strength, qty, pharmacy)
                for rec in records:
                    try:
                        price = float(rec.get('cash_price', 0))
                    except (ValueError, TypeError):
                        continue
                    if price <= 0 or price > 500:
                        continue
                    total_attempted += 1
                    for _ in range(3):
                        if post_price(rec, session):
                            total_inserted += 1
                            drug_inserted += 1
                            break
                        time.sleep(2)
                time.sleep(0.4)

        log.info(f"[{run_id}] {drug_name}: +{drug_inserted} records | running total: {total_inserted}")

    log.info(f"[{run_id}] ── Pass complete: {total_inserted}/{total_attempted} inserted ──")
    return total_inserted

def main():
    pass_num = 0
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    log.info("═══════════════════════════════════════════════════════")
    log.info("  TransparentRx Scraper — CONTINUOUS MODE ACTIVE")
    log.info(f"  {len(PHARMACY_CONFIGS)} pharmacies · {len(TIER_1_DAILY)} catalog drugs · runs forever")
    log.info("  User-submitted drugs polled after every pass")
    log.info("═══════════════════════════════════════════════════════")

    while True:
        pass_num += 1
        run_id = str(uuid.uuid4())[:8]
        try:
            # 1 — Standard catalog pass
            inserted = run_pass(session, run_id)
            log.info(f"Pass #{pass_num} complete — {inserted} records. Checking queued jobs...")

            # 2 — User-submitted drug queue
            queued = run_queued_jobs(session, run_id)
            log.info(f"Pass #{pass_num} queued jobs — {queued} records. Pausing {LOOP_PAUSE}s.")

        except KeyboardInterrupt:
            log.info("Keyboard interrupt — stopping.")
            break
        except Exception as e:
            log.error(f"Pass #{pass_num} crashed: {e} — restarting in {RETRY_DELAY}s")
            time.sleep(RETRY_DELAY)
            session = requests.Session()
            session.headers.update({"Content-Type": "application/json"})
            continue

        time.sleep(LOOP_PAUSE)

if __name__ == "__main__":
    main()
