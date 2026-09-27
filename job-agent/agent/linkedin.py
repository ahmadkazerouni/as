"""LinkedIn public (guest) job search. No login, so your account is never involved."""

import logging
import random
import re
import time
from dataclasses import dataclass
from urllib.parse import parse_qs, unquote, urlparse

import requests
from bs4 import BeautifulSoup, Comment

log = logging.getLogger(__name__)

SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
}


@dataclass
class Job:
    id: str
    title: str
    company: str
    location: str
    url: str
    description: str = ""
    apply_url: str | None = None  # company site; None means Easy Apply / unknown


def _get(url: str, **params) -> requests.Response | None:
    for attempt in range(3):
        resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            return resp
        if resp.status_code in (429, 999):
            wait = 30 * (attempt + 1)
            log.warning("LinkedIn rate limit (%s), waiting %ss", resp.status_code, wait)
            time.sleep(wait)
            continue
        log.warning("LinkedIn %s for %s", resp.status_code, url)
        return None
    return None


def search(keyword: str, location: str, posted_within_seconds: int, pages: int) -> list[Job]:
    jobs: list[Job] = []
    for page in range(pages):
        resp = _get(
            SEARCH_URL,
            keywords=keyword,
            location=location,
            f_TPR=f"r{posted_within_seconds}",
            start=page * 25,
        )
        if resp is None or not resp.text.strip():
            break
        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select("div.base-card, div.job-search-card")
        for card in cards:
            urn = card.get("data-entity-urn", "")
            m = re.search(r"(\d+)$", urn)
            link = card.select_one("a.base-card__full-link")
            if not m and link:
                m = re.search(r"-(\d+)(?:\?|$)", link.get("href", ""))
            if not m:
                continue
            jobs.append(
                Job(
                    id=m.group(1),
                    title=_text(card, ".base-search-card__title"),
                    company=_text(card, ".base-search-card__subtitle"),
                    location=_text(card, ".job-search-card__location"),
                    url=(link.get("href", "").split("?")[0] if link else ""),
                )
            )
        if len(cards) < 25:
            break
        time.sleep(random.uniform(2, 5))
    return jobs


def fetch_details(job: Job) -> Job:
    resp = _get(DETAIL_URL.format(job.id))
    if resp is None:
        return job
    soup = BeautifulSoup(resp.text, "html.parser")
    desc = soup.select_one(".show-more-less-html__markup, .description__text")
    job.description = desc.get_text("\n", strip=True) if desc else ""
    job.apply_url = _external_apply_url(soup)
    return job


def _external_apply_url(soup: BeautifulSoup) -> str | None:
    """Offsite jobs carry the company URL in <code id="applyUrl"><!--"...?url=..."--></code>.
    Easy Apply jobs don't have it."""
    code = soup.select_one("code#applyUrl")
    if not code:
        return None
    raw = "".join(c for c in code.contents if isinstance(c, Comment)) or code.get_text()
    raw = raw.strip().strip('"')
    if not raw:
        return None
    target = parse_qs(urlparse(raw).query).get("url")
    return unquote(target[0]) if target else raw


def _text(node, selector: str) -> str:
    el = node.select_one(selector)
    return el.get_text(strip=True) if el else ""
