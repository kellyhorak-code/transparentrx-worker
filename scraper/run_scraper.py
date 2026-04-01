#!/usr/bin/env python3
"""
TransparentRx Scraper — Bulletproof Continuous Mode
Batch inserts — one POST per drug instead of one per record.
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
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

WORKER_URL   = "https://transparentrx-worker.kellybhorak.workers.dev"
QUANTITIES   = [30, 90]
POST_TIMEOUT = 60
RETRY_DELAY  = 5
LOOP_PAUSE   = 3600    # 1 hour between full passes
BATCH_SIZE   = 200     # records per POST to batch endpoint

PRIORITY_PHARMACIES = [p for p in PHARMACY_CONFIGS if p.get('zip') in (
    '76102','77001','75201','90001','60601','10001','98101','85004','32201','78701'
)]
if not PRIORITY_PHARMACIES:
    PRIORITY_PHARMACIES = PHARMACY_CONFIGS[:20]

def post_batch(records, session, retries=3):
    """POST a batch of records in one request. Returns (inserted, skipped)."""
    if not records:
        return 0, 0
    for attempt in range(1, retries + 1):
        try:
            r = session.post(
                WORKER_URL + "/api/retail-price-batch",
                json={"records": records},
                timeout=POST_TIMEOUT
            )
            if r.status_code == 200:
                data = r.json()
                return data.get('inserted', 0), data.get('skipped', 0)
            else:
                log.warning(f"Batch POST {r.status_code}: {r.text[:100]}")
        except requests.exceptions.Timeout:
            log.warning(f"Batch POST timeout (attempt {attempt}/{retries})")
        except Exception as e:
            log.warning(f"Batch POST error (attempt {attempt}/{retries}): {e}")
        if attempt < retries:
            time.sleep(RETRY_DELAY)
    return 0, len(records)

def flush_batch(batch, session):
    """Flush accumulated records in BATCH_SIZE chunks."""
    total_inserted = 0
    for i in range(0, len(batch), BATCH_SIZE):
        chunk = batch[i:i + BATCH_SIZE]
        ins, skp = post_batch(chunk, session)
        total_inserted += ins
        log.debug(f"Flushed chunk: {ins} inserted, {skp} skipped")
    return total_inserted

def scrape_drug(drug_name, strength, qty, pharmacy):
    """Scrape one drug/pharmacy combo with retries."""
    for attempt in range(1, 4):
        try:
            return buzz_scrape(drug_name, strength, qty, pharmacy["zip"])
        except Exception as e:
            log.warning(f"Scrape attempt {attempt}/3 failed: {drug_name} @ {pharmacy['zip']}: {e}")
            if attempt < 3:
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
    try:
        r = session.get(WORKER_URL + "/api/scrape-jobs", timeout=15)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        log.warning(f"Could not fetch scrape jobs: {e}")
    return []

def fetch_promotable_drugs(session):
    """Fetch user-submitted drugs that have enough observations to join main catalog."""
    try:
        r = session.get(WORKER_URL + "/api/promotable-drugs", timeout=15)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        log.warning(f"Could not fetch promotable drugs: {e}")
    return []

def mark_promoted(drug_name, session):
    """Mark drug as promoted in worker DB."""
    try:
        session.post(
            WORKER_URL + "/api/promote-drug",
            json={"drug_name": drug_name},
            timeout=15
        )
    except Exception as e:
        log.warning(f"Could not mark {drug_name} as promoted: {e}")

def promote_drugs_to_catalog(session, run_id):
    """
    Check for user-submitted drugs with 10+ observations across 3+ pharmacies.
    Append them to drug_catalog.py so they run on every future pass.
    """
    candidates = fetch_promotable_drugs(session)
    if not candidates:
        log.info(f"[{run_id}] No drugs ready for promotion.")
        return 0

    catalog_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drug_catalog.py")

    with open(catalog_path, "r") as f:
        catalog_content = f.read()

    # Get already-catalogued drugs to avoid dupes
    from drug_catalog import TIER_1_DAILY
    existing = {d[0].lower().strip() for d in TIER_1_DAILY}

    promoted_count = 0
    for drug in candidates:
        drug_name = (drug.get("drug_name") or "").lower().strip()
        if not drug_name or drug_name in existing:
            mark_promoted(drug_name, session)
            continue

        obs   = drug.get("observations", 0)
        pharm = drug.get("pharmacy_count", 0)
        lo    = drug.get("min_price", 0)
        hi    = drug.get("max_price", 0)

        # Use most common observed strength or empty string
        entry = f'    ("{drug_name}", ""),  # auto-promoted: {obs} obs, {pharm} pharmacies, ${lo:.2f}–${hi:.2f}\n'

        # Inject before closing bracket of TIER_1_DAILY
        if catalog_content.rstrip().endswith("]"):
            catalog_content = catalog_content.rstrip()[:-1].rstrip()
            catalog_content += f'\n    # AUTO-PROMOTED — {drug_name.upper()}\n'
            catalog_content += entry
            catalog_content += "\n]\n"

            with open(catalog_path, "w") as f:
                f.write(catalog_content)

            existing.add(drug_name)
            mark_promoted(drug_name, session)
            promoted_count += 1
            log.info(f"[{run_id}] ✅ PROMOTED: {drug_name.upper()} → added to main catalog ({obs} obs, {pharm} pharmacies)")

    if promoted_count:
        log.info(f"[{run_id}] ── {promoted_count} drug(s) promoted to main catalog. Reloading... ──")
        # Reload the catalog module so next pass picks up new drugs
        import importlib
        import drug_catalog
        importlib.reload(drug_catalog)
        global TIER_1_DAILY
        TIER_1_DAILY = drug_catalog.TIER_1_DAILY
        log.info(f"[{run_id}] Catalog now has {len(TIER_1_DAILY)} drugs.")

    return promoted_count

def run_queued_jobs(session, run_id):
    """Process user-submitted drug queue."""
    jobs = fetch_queued_jobs(session)
    if not jobs:
        log.info(f"[{run_id}] No queued jobs.")
        return 0

    log.info(f"[{run_id}] ── Queued Jobs: {len(jobs)} user-submitted drugs ──")
    total_inserted = 0

    for job in jobs:
        job_id   = job.get('id')
        drug_raw = (job.get('drug_name') or '').strip()
        zip_code = (job.get('zip_code') or '76102').strip()
        if not drug_raw:
            mark_job_complete(job_id, session, 'skipped')
            continue

        drug_name = drug_raw.lower()
        zip_pharmacies = [p for p in PHARMACY_CONFIGS if p.get('zip') == zip_code] or PRIORITY_PHARMACIES
        batch = []

        for pharmacy in zip_pharmacies[:5]:
            records = scrape_drug(drug_name, '', 30, pharmacy)
            for rec in records:
                try:
                    price = float(rec.get('cash_price', 0))
                except (ValueError, TypeError):
                    continue
                if price <= 0 or price > 500:
                    continue
                batch.append(rec)
            time.sleep(0.4)

        ins = flush_batch(batch, session)
        total_inserted += ins
        log.info(f"[{run_id}] Queued: {drug_raw} → {ins} records inserted")
        mark_job_complete(job_id, session, 'complete' if ins > 0 else 'no_data')

    log.info(f"[{run_id}] ── Queued jobs done: {total_inserted} total ──")
    return total_inserted

def run_pass(session, run_id):
    """
    Full catalog pass — collects ALL records per drug across all pharmacies
    then flushes in one batch per drug. Reduces worker calls by ~97%.
    """
    drugs = TIER_1_DAILY
    total_inserted = 0

    log.info(f"[{run_id}] ── Starting pass: {len(drugs)} drugs × {len(QUANTITIES)} qty × {len(PHARMACY_CONFIGS)} pharmacies (batch mode) ──")

    for drug_name, strength in drugs:
        drug_batch = []

        for qty in QUANTITIES:
            for pharmacy in PHARMACY_CONFIGS:
                records = scrape_drug(drug_name, strength, qty, pharmacy)
                for rec in records:
                    try:
                        price = float(rec.get('cash_price', 0))
                    except (ValueError, TypeError):
                        continue
                    if price <= 0 or price > 500:
                        continue
                    drug_batch.append(rec)
                time.sleep(0.35)

        # One batch POST per drug instead of one POST per record
        drug_inserted = flush_batch(drug_batch, session)
        total_inserted += drug_inserted
        log.info(f"[{run_id}] {drug_name}: {len(drug_batch)} scraped → {drug_inserted} inserted | total: {total_inserted}")

    log.info(f"[{run_id}] ── Pass complete: {total_inserted} total inserted ──")
    return total_inserted

def main():
    pass_num = 0
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    log.info("═══════════════════════════════════════════════════════")
    log.info("  TransparentRx Scraper — BATCH MODE ACTIVE")
    log.info(f"  {len(PHARMACY_CONFIGS)} pharmacies · {len(TIER_1_DAILY)} drugs")
    log.info(f"  {BATCH_SIZE} records/POST · {LOOP_PAUSE//3600}h between passes")
    log.info("  User-submitted drugs polled after every pass")
    log.info("═══════════════════════════════════════════════════════")

    while True:
        pass_num += 1
        run_id = str(uuid.uuid4())[:8]
        try:
            inserted = run_pass(session, run_id)
            log.info(f"Pass #{pass_num} complete — {inserted} records. Checking queued jobs...")
            queued = run_queued_jobs(session, run_id)
            log.info(f"Pass #{pass_num} queued — {queued} records. Checking promotions...")
            promoted = promote_drugs_to_catalog(session, run_id)
            log.info(f"Pass #{pass_num} promotions — {promoted} drugs added to catalog. Next pass in {LOOP_PAUSE//3600}h.")
        except KeyboardInterrupt:
            log.info("Stopping.")
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
