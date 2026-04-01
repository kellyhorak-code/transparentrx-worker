#!/usr/bin/env python3
"""
TransparentRx Scraper — Bulletproof Continuous Mode
Runs forever. Retries every error. Never stops.
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
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)

WORKER_URL  = "https://transparentrx-worker.kellybhorak.workers.dev"
QUANTITIES  = [30, 90]
POST_TIMEOUT = 30
RETRY_DELAY  = 5    # seconds between retries on error
LOOP_PAUSE   = 60   # seconds between full catalog passes

def post_price(record, session):
    """POST a single price record. Returns True on success."""
    try:
        r = session.post(
            WORKER_URL + "/api/retail-price",
            json=record,
            timeout=POST_TIMEOUT
        )
        return r.status_code == 200
    except requests.exceptions.Timeout:
        log.warning(f"POST timeout — will retry")
        return False
    except requests.exceptions.ConnectionError as e:
        log.warning(f"POST connection error: {e}")
        return False
    except Exception as e:
        log.warning(f"POST error: {e}")
        return False

def scrape_with_retry(drug_name, strength, qty, pharmacy, max_retries=3):
    """Scrape one drug/pharmacy combo with retries."""
    for attempt in range(1, max_retries + 1):
        try:
            records = buzz_scrape(drug_name, strength, qty, pharmacy["zip"])
            return records
        except Exception as e:
            log.warning(f"Scrape attempt {attempt}/{max_retries} failed for {drug_name} @ {pharmacy['zip']}: {e}")
            if attempt < max_retries:
                time.sleep(RETRY_DELAY)
    return []

def run_pass(session, run_id):
    """Run one full pass through all drugs × quantities × pharmacies."""
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
                    # Retry post up to 3 times
                    for post_attempt in range(3):
                        if post_price(rec, session):
                            total_inserted += 1
                            drug_inserted += 1
                            break
                        time.sleep(2)
                time.sleep(0.4)  # polite delay between pharmacy calls

        log.info(f"[{run_id}] {drug_name}: +{drug_inserted} records this pass | running total: {total_inserted}")

    log.info(f"[{run_id}] ── Pass complete: {total_inserted}/{total_attempted} inserted ──")
    return total_inserted

def main():
    pass_num = 0
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    log.info("═══════════════════════════════════════════════════")
    log.info("  TransparentRx Scraper — CONTINUOUS MODE ACTIVE")
    log.info(f"  {len(PHARMACY_CONFIGS)} pharmacies · {len(TIER_1_DAILY)} drugs · runs forever")
    log.info("═══════════════════════════════════════════════════")

    while True:
        pass_num += 1
        run_id = str(uuid.uuid4())[:8]
        try:
            inserted = run_pass(session, run_id)
            log.info(f"Pass #{pass_num} complete — {inserted} records inserted. Pausing {LOOP_PAUSE}s before next pass.")
        except KeyboardInterrupt:
            log.info("Keyboard interrupt — stopping scraper.")
            break
        except Exception as e:
            log.error(f"Pass #{pass_num} crashed unexpectedly: {e} — restarting in {RETRY_DELAY}s")
            time.sleep(RETRY_DELAY)
            # Recreate session on crash
            session = requests.Session()
            session.headers.update({"Content-Type": "application/json"})
            continue

        time.sleep(LOOP_PAUSE)

if __name__ == "__main__":
    main()
