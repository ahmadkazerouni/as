"""Job agent: LinkedIn search -> score -> tailor resume -> apply on company site.

    python main.py            # run forever, every 30-60 minutes
    python main.py --once     # single run
"""

import argparse
import logging
import os
import random
import re
import time
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

from agent import linkedin, llm
from agent.apply import apply
from agent.config import DATA_DIR, load_config
from agent.notify import notify
from agent.resume import cover_letter_html, render_pdf, resume_html
from agent.store import Store

log = logging.getLogger("job-agent")


def collect_new_jobs(cfg, store: Store) -> list[linkedin.Job]:
    s = cfg.searches
    excluded = [w.lower() for w in cfg.raw.get("exclude_title_words", [])]
    found: dict[str, linkedin.Job] = {}
    for kw in s["keywords"]:
        for job in linkedin.search(kw, s["location"], s["posted_within_seconds"], s.get("pages_per_keyword", 1)):
            if job.id in found or store.seen(job.id):
                continue
            if any(w in job.title.lower() for w in excluded):
                store.save(job, "excluded_title")
                continue
            found[job.id] = job
        time.sleep(random.uniform(3, 7))
    log.info("%d new jobs", len(found))
    return list(found.values())


def run_once(cfg):
    store = Store()
    remaining_today = cfg.max_applications_per_day - store.applied_today()
    budget = min(cfg.max_applications_per_run, remaining_today)
    if budget <= 0:
        log.info("Daily application limit reached")
        return

    jobs = collect_new_jobs(cfg, store)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=_headless())
        try:
            for job in jobs:
                if budget <= 0:
                    break
                time.sleep(random.uniform(2, 5))
                linkedin.fetch_details(job)
                if not job.apply_url or "linkedin.com" in job.apply_url:
                    store.save(job, "easy_apply_skipped")
                    continue
                if not job.description:
                    store.save(job, "no_description")
                    continue

                score = llm.score_job(cfg.profile, job)
                log.info("%s @ %s -> %d (%s)", job.title, job.company, score.score, score.reasons)
                if score.score < cfg.min_score or not score.is_product_role:
                    store.save(job, "low_score", score.score, score.reasons)
                    continue

                if process_job(cfg, store, browser, job, score):
                    budget -= 1
        finally:
            browser.close()


def process_job(cfg, store, browser, job, score) -> bool:
    out_dir = DATA_DIR / "applications" / f"{datetime.now():%Y%m%d-%H%M}-{_slug(job.company)}-{job.id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    language = "de" if score.job_language == "de" else "en"
    tailored = llm.tailor(cfg.profile, cfg.facts, job, language)
    (out_dir / "job.txt").write_text(f"{job.title}\n{job.company}\n{job.url}\n{job.apply_url}\n\n{job.description}", encoding="utf-8")
    (out_dir / "cover_letter.txt").write_text(tailored.cover_letter, encoding="utf-8")
    name = f"{cfg.facts.get('first_name', '')}_{cfg.facts.get('last_name', '')}".strip("_")
    resume_pdf = render_pdf(browser, resume_html(tailored, cfg.facts), out_dir / f"{name}_CV.pdf")
    letter_pdf = render_pdf(browser, cover_letter_html(tailored, cfg.facts), out_dir / f"{name}_Cover_Letter.pdf")

    result = apply(browser, job.apply_url, cfg.profile, cfg.facts, job, tailored,
                   resume_pdf, letter_pdf, out_dir, cfg.dry_run)
    store.save(job, result.status, score.score, result.reason)

    icon = {"submitted": "✅", "ready_dry_run": "🧪", "needs_manual": "✋", "failed": "❌"}[result.status]
    notify(
        f"{icon} {result.status.upper()} — {job.title} @ {job.company} (score {score.score})\n"
        f"{result.reason}\n\nApply: {job.apply_url}\nLinkedIn: {job.url}",
        [resume_pdf, letter_pdf, result.screenshot],
    )
    return result.status in ("submitted", "ready_dry_run")


def _slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-")[:40] or "company"


def _headless() -> bool:
    return os.environ.get("HEADLESS", "1") != "0"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="run a single cycle and exit")
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    cfg = load_config(args.config)
    log.info("Mode: %s", cfg.mode)
    while True:
        try:
            run_once(cfg)
        except Exception as e:
            log.exception("run failed")
            notify(f"❌ Job agent run failed: {type(e).__name__}: {e}")
        if args.once:
            break
        lo, hi = cfg.interval_minutes
        wait = random.uniform(lo, hi)
        log.info("Sleeping %.0f minutes", wait)
        time.sleep(wait * 60)


if __name__ == "__main__":
    main()
