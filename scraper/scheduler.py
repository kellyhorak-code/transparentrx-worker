"""
scheduler.py

Cron-style scheduler that runs on a server (or cron job) and queues
the right tier of jobs each day.

Cron setup:
  # Daily tier — runs every day at 2am
  0 2 * * * cd /path/to/scraper && python scheduler.py daily

  # Weekly tier — runs every Monday at 3am
  0 3 * * 1 cd /path/to/scraper && python scheduler.py weekly

  # Monthly tier — runs on the 1st of each month at 4am
  0 4 1 * * cd /path/to/scraper && python scheduler.py monthly

Or just run manually:
  python scheduler.py daily
  python scheduler.py weekly
  python scheduler.py monthly
"""

import sys
import subprocess
from datetime import datetime

def run(tier: str):
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    print(f"[{now}] Scheduler: queueing {tier} jobs")
    subprocess.run(
        ["python", "generate_scrape_jobs.py", tier],
        check=True
    )
    print(f"[{now}] Scheduler: {tier} jobs queued")

if __name__ == "__main__":
    tier = sys.argv[1] if len(sys.argv) > 1 else None
    if tier not in ("daily", "weekly", "monthly"):
        print("Usage: python scheduler.py [daily|weekly|monthly]")
        sys.exit(1)
    run(tier)