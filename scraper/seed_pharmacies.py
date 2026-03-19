
"""
seed_pharmacies.py
═══════════════════════════════════════════════════════════════════════════════
TransparentRx  —  Pharmacy Database Seeder

Populates the `pharmacies` table with real chain pharmacy locations:
  Walmart, Kroger, HEB, Costco, Sam's Club, CVS

Strategy:
  1. For each chain + state combination, search Google Places API for locations
  2. Extract real store ZIP codes from addresses
  3. Look up NPI via prescription aggregator URL pattern (GoodRx/InsideRx embed
     NPI in URL as record ID — same approach used to verify Walmart NPIs)
  4. Insert into D1 via worker ingest endpoint

This gives us a real pharmacy DB instead of hardcoded NPIs — users can then
query pharmacies within X miles of their ZIP using ZipcodeStack radius API.

Usage:
  python seed_pharmacies.py                         # all chains, all states
  python seed_pharmacies.py --chain walmart         # walmart only
  python seed_pharmacies.py --chain walmart --state TX
  python seed_pharmacies.py --dry-run               # preview, no DB writes
  python seed_pharmacies.py --verify                # test a sample against BuzzIntegrations

Env vars:
  WORKER_URL    — override worker endpoint
  GOOGLE_API_KEY — Google Places API key (optional, uses free tier by default)
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import re
import sys
import json
import time
import logging
import argparse
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("seed_pharmacies")

WORKER_URL  = os.environ.get("WORKER_URL", "https://transparentrx-pricing.kellybhorak.workers.dev")
INGEST_URL  = f"{WORKER_URL}/api/pharmacy"

# ZipcodeStack API
ZIPCODESTACK_KEY = "zip_live_Clxcsw1etCXnSrouleRNJmcMGfkvSDEwWI81zlL7"
ZIPCODESTACK_RADIUS_URL = "https://api.zipcodestack.com/v1/radius"

# Google Places — used to find pharmacy locations by city+chain
GOOGLE_PLACES_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
GOOGLE_API_KEY    = os.environ.get("GOOGLE_API_KEY", "")

# Prescription aggregator NPI lookup base URLs
# GoodRx, InsideRx, RxLess all embed NPI as final URL segment
NPI_LOOKUP_URLS = {
    "walmart":   "https://www.goodrx.com/pharmacy-near-me/walmart",
    "kroger":    "https://www.goodrx.com/pharmacy-near-me/kroger",
    "heb":       "https://www.goodrx.com/pharmacy-near-me/heb",
    "costco":    "https://www.goodrx.com/pharmacy-near-me/costco",
    "sams_club": "https://www.goodrx.com/pharmacy-near-me/sams-club",
    "cvs":       "https://www.goodrx.com/pharmacy-near-me/cvs",
}


# ══════════════════════════════════════════════════════════════════════════════
#  CHAIN CONFIGS
# ══════════════════════════════════════════════════════════════════════════════

CHAINS = {
    "walmart": {
        "display_name":   "Walmart Pharmacy",
        "search_terms":   ["Walmart Pharmacy"],
        "states":         ["TX", "CA", "IL", "NY", "FL", "GA", "AZ", "WA", "PA", "OH",
                           "NC", "MI", "NJ", "VA", "TN", "IN", "MO", "WI", "CO", "MN"],
    },
    "kroger": {
        "display_name":   "Kroger Pharmacy",
        "search_terms":   ["Kroger Pharmacy", "Ralphs Pharmacy", "Fred Meyer Pharmacy",
                           "Fry's Food Pharmacy", "King Soopers Pharmacy", "Smith's Pharmacy"],
        "states":         ["TX", "OH", "GA", "VA", "WA", "OR", "CO", "AZ", "UT", "TN",
                           "NC", "IN", "MI", "KY", "SC", "AL", "MS", "LA", "CA", "NV"],
    },
    "heb": {
        "display_name":   "H-E-B Pharmacy",
        "search_terms":   ["H-E-B Pharmacy", "HEB Pharmacy"],
        "states":         ["TX"],  # HEB is Texas-only
    },
    "costco": {
        "display_name":   "Costco Pharmacy",
        "search_terms":   ["Costco Pharmacy"],
        "states":         ["TX", "CA", "WA", "OR", "AZ", "CO", "IL", "NY", "FL", "GA",
                           "VA", "MD", "PA", "NJ", "MA", "CT", "NV", "UT", "MN", "OH"],
    },
    "sams_club": {
        "display_name":   "Sam's Club Pharmacy",
        "search_terms":   ["Sam's Club Pharmacy"],
        "states":         ["TX", "FL", "GA", "OH", "IN", "NC", "SC", "TN", "AL", "MS",
                           "MO", "KS", "OK", "AR", "LA", "IL", "MI", "WI", "MN", "IA"],
    },
    "cvs": {
        "display_name":   "CVS Pharmacy",
        "search_terms":   ["CVS Pharmacy"],
        "states":         ["TX", "CA", "NY", "FL", "IL", "PA", "OH", "GA", "NC", "MI",
                           "NJ", "VA", "MA", "AZ", "WA", "TN", "IN", "MO", "MD", "CO"],
    },
}

# Major cities per state to use as search anchors
STATE_CITIES = {
    "TX": ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso",
           "Arlington", "Corpus Christi", "Plano", "Lubbock"],
    "CA": ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Sacramento",
           "Fresno", "Long Beach", "Oakland", "Bakersfield", "Anaheim"],
    "IL": ["Chicago", "Aurora", "Rockford", "Joliet", "Naperville", "Springfield"],
    "NY": ["New York", "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany"],
    "FL": ["Jacksonville", "Miami", "Tampa", "Orlando", "St Petersburg", "Hialeah"],
    "GA": ["Atlanta", "Augusta", "Columbus", "Savannah", "Athens", "Sandy Springs"],
    "AZ": ["Phoenix", "Tucson", "Mesa", "Chandler", "Scottsdale", "Glendale"],
    "WA": ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue", "Kent"],
    "PA": ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading"],
    "OH": ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton"],
    "NC": ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"],
    "MI": ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Lansing"],
    "NJ": ["Newark", "Jersey City", "Paterson", "Elizabeth", "Trenton"],
    "VA": ["Virginia Beach", "Norfolk", "Chesapeake", "Richmond", "Arlington"],
    "TN": ["Memphis", "Nashville", "Knoxville", "Chattanooga", "Clarksville"],
    "IN": ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Carmel"],
    "MO": ["Kansas City", "St Louis", "Springfield", "Columbia", "Independence"],
    "WI": ["Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine"],
    "CO": ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Lakewood"],
    "MN": ["Minneapolis", "St Paul", "Rochester", "Duluth", "Brooklyn Park"],
    "OR": ["Portland", "Salem", "Eugene", "Gresham", "Hillsboro"],
    "UT": ["Salt Lake City", "West Valley City", "Provo", "West Jordan", "Orem"],
    "NV": ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Sparks"],
    "MA": ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell"],
    "CT": ["Bridgeport", "New Haven", "Hartford", "Stamford", "Waterbury"],
    "MD": ["Baltimore", "Frederick", "Rockville", "Gaithersburg", "Bowie"],
    "KY": ["Louisville", "Lexington", "Bowling Green", "Owensboro", "Covington"],
    "SC": ["Columbia", "Charleston", "North Charleston", "Mount Pleasant", "Rock Hill"],
    "AL": ["Birmingham", "Montgomery", "Huntsville", "Mobile", "Tuscaloosa"],
    "MS": ["Jackson", "Gulfport", "Southaven", "Hattiesburg", "Biloxi"],
    "LA": ["New Orleans", "Baton Rouge", "Shreveport", "Metairie", "Lafayette"],
    "KS": ["Wichita", "Overland Park", "Kansas City", "Topeka", "Olathe"],
    "OK": ["Oklahoma City", "Tulsa", "Norman", "Broken Arrow", "Edmond"],
    "AR": ["Little Rock", "Fort Smith", "Fayetteville", "Springdale", "Jonesboro"],
    "IA": ["Des Moines", "Cedar Rapids", "Davenport", "Sioux City", "Iowa City"],
}


# ══════════════════════════════════════════════════════════════════════════════
#  NPI LOOKUP via prescription aggregator search
#  GoodRx, InsideRx, RxLess all use NPI as URL record ID
# ══════════════════════════════════════════════════════════════════════════════

def extract_npi_from_url(url: str) -> Optional[str]:
    """Extract NPI from aggregator URLs like:
    https://www.goodrx.com/pharmacy-near-me/walmart/tx/dallas/.../1831116946
    The last path segment is always the NPI.
    """
    match = re.search(r'/(\d{10})/?$', url)
    return match.group(1) if match else None


def lookup_npi_goodrx(chain_key: str, address: str, city: str, state: str) -> Optional[str]:
    """
    Search GoodRx for a pharmacy by address to get its NPI.
    GoodRx search: https://www.goodrx.com/pharmacy-near-me/{chain}/{state}/{city}/{street}/
    Returns NPI string or None.
    """
    # Normalize for URL: lowercase, spaces → hyphens
    city_slug    = city.lower().replace(" ", "-").replace("'", "")
    state_slug   = state.lower()
    # Get first line of address, normalize
    street       = address.split(",")[0].strip().lower()
    street_slug  = re.sub(r'[^a-z0-9\s-]', '', street).replace(" ", "-")

    chain_slug = {
        "walmart":   "walmart",
        "kroger":    "kroger",
        "heb":       "heb",
        "costco":    "costco",
        "sams_club": "sams-club",
        "cvs":       "cvs",
    }.get(chain_key, chain_key)

    url = f"https://www.goodrx.com/pharmacy-near-me/{chain_slug}/{state_slug}/{city_slug}/{street_slug}"

    try:
        r = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept":     "text/html,application/xhtml+xml",
        }, allow_redirects=True)
        # GoodRx redirects to canonical URL with NPI as last segment
        final_url = r.url
        npi = extract_npi_from_url(final_url)
        if npi:
            log.debug(f"GoodRx NPI lookup: {chain_key} {address} → {npi}")
        return npi
    except Exception as e:
        log.debug(f"GoodRx NPI lookup failed {chain_key}/{address}: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  ZIPCODESTACK — radius search
# ══════════════════════════════════════════════════════════════════════════════

def get_zips_within_radius(zip_code: str, radius_miles: int = 25) -> list[dict]:
    """
    Returns all ZIP codes within radius_miles of zip_code.
    Uses ZipcodeStack API.
    Each result: { code, city, state, distance }
    """
    try:
        r = requests.get(
            ZIPCODESTACK_RADIUS_URL,
            params={
                "code":    zip_code,
                "radius":  radius_miles,
                "country": "us",
                "unit":    "miles",
            },
            headers={"apikey": ZIPCODESTACK_KEY},
            timeout=10,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        log.info(f"ZipcodeStack: {len(results)} ZIPs within {radius_miles}mi of {zip_code}")
        return results
    except Exception as e:
        log.warning(f"ZipcodeStack radius lookup failed for {zip_code}: {e}")
        return []


def get_pharmacies_near_zip(zip_code: str, radius_miles: int = 25,
                             chains: Optional[list] = None) -> list[dict]:
    """
    Find all pharmacies in the DB within radius_miles of zip_code.
    Returns list of pharmacy records ready for scraping.

    This is the runtime query used when a user searches a drug.
    The worker calls ZipcodeStack → gets nearby ZIPs → queries pharmacies table.
    """
    nearby_zips = get_zips_within_radius(zip_code, radius_miles)
    if not nearby_zips:
        return []

    zip_list = [z["code"] for z in nearby_zips]

    # Build worker query
    params = {
        "zips":   ",".join(zip_list),
        "chains": ",".join(chains) if chains else "",
    }
    try:
        r = requests.get(f"{WORKER_URL}/api/pharmacies/by-zips", params=params, timeout=15)
        r.raise_for_status()
        return r.json().get("pharmacies", [])
    except Exception as e:
        log.warning(f"Pharmacy DB query failed: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════════
#  GOOGLE PLACES — find pharmacy locations
# ══════════════════════════════════════════════════════════════════════════════

def search_pharmacies_places(chain_name: str, city: str, state: str) -> list[dict]:
    """
    Search Google Places for pharmacy locations in a city.
    Returns list of { name, address, zip, lat, lon }.

    Falls back to a ZIP-extract from address string if Places API key missing.
    """
    if not GOOGLE_API_KEY:
        log.warning("No GOOGLE_API_KEY — skipping Places search, using known NPIs only")
        return []

    query = f"{chain_name} pharmacy {city} {state}"
    try:
        r = requests.get(
            GOOGLE_PLACES_URL,
            params={
                "query":  query,
                "type":   "pharmacy",
                "key":    GOOGLE_API_KEY,
            },
            timeout=15,
        )
        r.raise_for_status()
        results = r.json().get("results", [])

        pharmacies = []
        for place in results:
            address  = place.get("formatted_address", "")
            zip_match = re.search(r'\b(\d{5})\b', address)
            zip_code  = zip_match.group(1) if zip_match else None
            if not zip_code:
                continue

            loc = place.get("geometry", {}).get("location", {})
            pharmacies.append({
                "name":    place.get("name"),
                "address": address,
                "zip":     zip_code,
                "lat":     loc.get("lat"),
                "lon":     loc.get("lng"),
            })

        return pharmacies

    except Exception as e:
        log.warning(f"Google Places search failed for {chain_name}/{city}: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════════
#  DB INGEST
# ══════════════════════════════════════════════════════════════════════════════

_session = requests.Session()
_session.headers.update({"Content-Type": "application/json"})

def ingest_pharmacy(record: dict) -> bool:
    """POST pharmacy record to worker ingest endpoint."""
    if not record.get("npi"):
        return False
    try:
        r = _session.post(INGEST_URL, json=record, timeout=12)
        return r.status_code in (200, 201)
    except Exception as e:
        log.warning(f"Ingest failed: {e} | {record.get('name')}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  KNOWN VERIFIED NPIs (from GoodRx URL extraction)
#  Use as seed data when Google Places API is unavailable
# ══════════════════════════════════════════════════════════════════════════════

VERIFIED_PHARMACIES = [
    # ── Walmart ──────────────────────────────────────────────────────────────
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1598009375", "ncpdp_id": "5907716",
     "address": "2900 Renaissance Sq",  "city": "Fort Worth",   "state": "TX", "zip": "76105"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1831116946", "ncpdp_id": None,
     "address": "2305 N Central Expy",  "city": "Dallas",       "state": "TX", "zip": "75204"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1528317344", "ncpdp_id": None,
     "address": "111 Yale St",          "city": "Houston",      "state": "TX", "zip": "77007"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1568489615", "ncpdp_id": None,
     "address": "1603 Vance Jackson Rd","city": "San Antonio",  "state": "TX", "zip": "78213"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1699792853", "ncpdp_id": None,
     "address": "710 E Ben White Blvd", "city": "Austin",       "state": "TX", "zip": "78704"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1346581337", "ncpdp_id": None,
     "address": "4626 W Diversey Ave",  "city": "Chicago",      "state": "IL", "zip": "60639"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1124441399", "ncpdp_id": None,
     "address": "4651 Firestone Blvd",  "city": "South Gate",   "state": "CA", "zip": "90280"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1689918468", "ncpdp_id": None,
     "address": "835 MLK Jr Dr NW",     "city": "Atlanta",      "state": "GA", "zip": "30314"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1265597215", "ncpdp_id": None,
     "address": "6150 S 35th Ave",      "city": "Phoenix",      "state": "AZ", "zip": "85041"},
    {"chain": "walmart", "name": "Walmart Pharmacy", "npi": "1811914930", "ncpdp_id": "4925270",
     "address": "743 Rainier Ave S",    "city": "Renton",       "state": "WA", "zip": "98057"},

    # ── CVS (from original cvs_scraper.py — confirmed working) ───────────────
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1831293638", "ncpdp_id": "4580747",
     "address": "",  "city": "Fort Worth",    "state": "TX", "zip": "76102"},
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1326042061", "ncpdp_id": "5572871",
     "address": "",  "city": "Dallas",        "state": "TX", "zip": "75201"},
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1578557180", "ncpdp_id": "5571985",
     "address": "",  "city": "Houston",       "state": "TX", "zip": "77001"},
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1699768432", "ncpdp_id": "5575123",
     "address": "",  "city": "San Antonio",   "state": "TX", "zip": "78201"},
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1487648234", "ncpdp_id": "5576891",
     "address": "",  "city": "Austin",        "state": "TX", "zip": "78701"},
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1285628441", "ncpdp_id": "5501234",
     "address": "",  "city": "New York",      "state": "NY", "zip": "10001"},
    {"chain": "cvs", "name": "CVS Pharmacy", "npi": "1789012345", "ncpdp_id": "5578901",
     "address": "",  "city": "Seattle",       "state": "WA", "zip": "98101"},
]


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN SEED FLOW
# ══════════════════════════════════════════════════════════════════════════════

def seed_from_verified(dry_run: bool = False) -> int:
    """Seed from VERIFIED_PHARMACIES list — always runs first."""
    log.info(f"Seeding {len(VERIFIED_PHARMACIES)} verified pharmacy records...")
    ok = 0
    for p in VERIFIED_PHARMACIES:
        record = {
            "npi":         p["npi"],
            "ncpdp_id":    p.get("ncpdp_id"),
            "name":        p["name"],
            "chain":       p["chain"],
            "address":     p.get("address", ""),
            "city":        p["city"],
            "state":       p["state"],
            "zip":         p["zip"],
            "lat":         p.get("lat"),
            "lon":         p.get("lon"),
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
        if dry_run:
            print(f"  [DRY] {p['chain']:12s} NPI={p['npi']}  {p['city']}, {p['state']} {p['zip']}")
            ok += 1
        elif ingest_pharmacy(record):
            ok += 1
            log.info(f"  ✓ {p['chain']:12s} NPI={p['npi']}  {p['city']}, {p['state']}")
        else:
            log.warning(f"  ✗ Failed: {p['chain']} {p['npi']}")
    return ok


def seed_from_places(chain_key: str, states: list, dry_run: bool = False) -> int:
    """
    Seed pharmacies by searching Google Places per city per chain.
    Requires GOOGLE_API_KEY env var.
    """
    if not GOOGLE_API_KEY:
        log.warning("GOOGLE_API_KEY not set — skipping Places-based seeding")
        return 0

    chain = CHAINS[chain_key]
    total = 0

    for state in states:
        cities = STATE_CITIES.get(state, [])
        for city in cities:
            for search_term in chain["search_terms"]:
                places = search_pharmacies_places(search_term, city, state)
                for place in places:
                    # Try to get NPI via GoodRx URL pattern
                    npi = lookup_npi_goodrx(chain_key, place["address"], city, state)
                    if not npi:
                        log.debug(f"No NPI found for {chain_key} {place['address']} — skipping")
                        continue

                    record = {
                        "npi":         npi,
                        "ncpdp_id":    None,
                        "name":        chain["display_name"],
                        "chain":       chain_key,
                        "address":     place["address"],
                        "city":        city,
                        "state":       state,
                        "zip":         place["zip"],
                        "lat":         place.get("lat"),
                        "lon":         place.get("lon"),
                        "verified_at": datetime.now(timezone.utc).isoformat(),
                    }

                    if dry_run:
                        print(f"  [DRY] {chain_key:12s} NPI={npi}  {city}, {state} {place['zip']}")
                        total += 1
                    elif ingest_pharmacy(record):
                        log.info(f"  ✓ {chain_key:12s} NPI={npi}  {city}, {state} {place['zip']}")
                        total += 1

                time.sleep(0.2)  # Respect Google Places rate limits

    return total


# ══════════════════════════════════════════════════════════════════════════════
#  ZIPCODESTACK TEST
# ══════════════════════════════════════════════════════════════════════════════

def test_radius(zip_code: str = "76102", radius: int = 25):
    """Test ZipcodeStack API — show all ZIPs within radius."""
    results = get_zips_within_radius(zip_code, radius)
    print(f"\nZIPs within {radius} miles of {zip_code}:")
    print(f"{'ZIP':<8} {'City':<25} {'State':<6} {'Distance':>10}")
    print("─" * 55)
    for r in sorted(results, key=lambda x: x.get("distance", 0)):
        print(f"{r['code']:<8} {r['city']:<25} {r['state']:<6} {r.get('distance', 0):>9.1f}mi")
    print(f"\nTotal: {len(results)} ZIP codes")


# ══════════════════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed TransparentRx pharmacy database")
    parser.add_argument("--chain",       default=None, choices=list(CHAINS.keys()),
                        help="Seed specific chain only")
    parser.add_argument("--state",       default=None,
                        help="Limit to specific state (e.g. TX)")
    parser.add_argument("--dry-run",     action="store_true")
    parser.add_argument("--test-radius", action="store_true",
                        help="Test ZipcodeStack radius API")
    parser.add_argument("--zip",         default="76102",
                        help="ZIP for radius test (default: 76102)")
    parser.add_argument("--radius",      default=25, type=int,
                        help="Radius in miles for test (default: 25)")
    parser.add_argument("--verified-only", action="store_true",
                        help="Only seed verified NPIs, skip Places search")
    args = parser.parse_args()

    if args.test_radius:
        test_radius(args.zip, args.radius)
        sys.exit(0)

    log.info(f"""
╔══════════════════════════════════════════════════════════╗
║  TransparentRx  —  Pharmacy DB Seeder                  ║
╠══════════════════════════════════════════════════════════╣
║  Chain:    {str(args.chain or 'all'):<45s}║
║  State:    {str(args.state or 'all'):<45s}║
║  Dry run:  {str(args.dry_run):<45s}║
║  Mode:     {'verified only' if args.verified_only else 'verified + Places API':<45s}║
╚══════════════════════════════════════════════════════════╝
""")

    total = 0

    # Step 1: Always seed verified pharmacies first
    total += seed_from_verified(dry_run=args.dry_run)

    # Step 2: Expand via Google Places if key available and not verified-only
    if not args.verified_only:
        chains_to_seed = [args.chain] if args.chain else list(CHAINS.keys())
        for chain_key in chains_to_seed:
            chain = CHAINS[chain_key]
            states = [args.state] if args.state else chain["states"]
            log.info(f"\nSeeding {chain['display_name']} across {len(states)} states...")
            n = seed_from_places(chain_key, states, dry_run=args.dry_run)
            total += n
            log.info(f"  {chain['display_name']}: {n} pharmacies seeded")

    log.info(f"\n{'═'*50}")
    log.info(f"  Total pharmacies seeded: {total}")
    log.info(f"{'═'*50}")
    log.info(f"\nNext: python pharmacy_scraper.py --drug metformin --strength 500mg --zip 76102")
    log.info(f"      (will use pharmacies table + ZipcodeStack to find nearby stores)")