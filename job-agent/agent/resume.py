"""Render tailored resume / cover letter to PDF with headless Chromium."""

import re
from html import escape
from pathlib import Path

from playwright.sync_api import Browser

from .llm import TailoredApplication

CSS = """
@page { size: A4; margin: 16mm 16mm 14mm; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1d2733; font-size: 10.2pt; line-height: 1.4; }
h1 { font-size: 21pt; margin: 0; letter-spacing: .3px; }
.headline { color: #3d5a80; font-size: 11pt; margin: 2px 0 6px; }
.contact { color: #555; font-size: 9pt; margin-bottom: 10px; }
h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #3d5a80;
     border-bottom: 1px solid #c9d3df; padding-bottom: 2px; margin: 14px 0 6px; }
.job { margin-bottom: 8px; page-break-inside: avoid; }
.row { display: flex; justify-content: space-between; }
.role { font-weight: 600; }
.meta { color: #666; font-size: 9pt; }
ul { margin: 3px 0 0 16px; padding: 0; }
li { margin-bottom: 2px; }
.skills { line-height: 1.6; }
.letter p { margin: 0 0 10px; }
"""


def _contact_line(facts: dict) -> str:
    parts = [facts.get("email"), facts.get("phone"), facts.get("current_location"), facts.get("linkedin")]
    return " · ".join(escape(p) for p in parts if p)


def resume_html(app: TailoredApplication, facts: dict) -> str:
    labels = {
        "en": ("Profile", "Experience", "Education", "Skills", "Languages"),
        "de": ("Profil", "Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen"),
    }[app.language]
    name = f"{facts.get('first_name', '')} {facts.get('last_name', '')}".strip()
    jobs = "".join(
        f"""<div class="job"><div class="row"><span class="role">{escape(e.title)} · {escape(e.company)}</span>
        <span class="meta">{escape(e.dates)}</span></div><div class="meta">{escape(e.location)}</div>
        <ul>{''.join(f'<li>{escape(b)}</li>' for b in e.bullets)}</ul></div>"""
        for e in app.experience
    )
    edu = "".join(
        f"""<div class="job"><div class="row"><span class="role">{escape(e.degree)}</span>
        <span class="meta">{escape(e.dates)}</span></div><div class="meta">{escape(e.school)}</div></div>"""
        for e in app.education
    )
    return f"""<!doctype html><html lang="{app.language}"><head><meta charset="utf-8"><style>{CSS}</style></head><body>
    <h1>{escape(name)}</h1><div class="headline">{escape(app.headline)}</div>
    <div class="contact">{_contact_line(facts)}</div>
    <h2>{labels[0]}</h2><p>{escape(app.summary)}</p>
    <h2>{labels[1]}</h2>{jobs}
    <h2>{labels[2]}</h2>{edu}
    <h2>{labels[3]}</h2><div class="skills">{' · '.join(escape(s) for s in app.skills)}</div>
    <h2>{labels[4]}</h2><div>{' · '.join(escape(s) for s in app.languages)}</div>
    </body></html>"""


def cover_letter_html(app: TailoredApplication, facts: dict) -> str:
    name = f"{facts.get('first_name', '')} {facts.get('last_name', '')}".strip()
    paras = "".join(f"<p>{escape(p.strip())}</p>" for p in re.split(r"\n\s*\n", app.cover_letter) if p.strip())
    return f"""<!doctype html><html lang="{app.language}"><head><meta charset="utf-8"><style>{CSS}</style></head><body>
    <h1>{escape(name)}</h1><div class="contact">{_contact_line(facts)}</div>
    <div class="letter">{paras}</div></body></html>"""


def render_pdf(browser: Browser, html: str, out: Path) -> Path:
    page = browser.new_page()
    try:
        page.set_content(html, wait_until="load")
        page.pdf(path=str(out), format="A4", print_background=True)
    finally:
        page.close()
    return out
