"""Fill and submit an application form on the company's own site, driven by Claude."""

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from playwright.sync_api import Browser, Frame, Page
from playwright.sync_api import TimeoutError as PWTimeout

from . import llm

log = logging.getLogger(__name__)

MAX_STEPS = 6
COOKIE_RE = re.compile(
    r"^\s*(accept all|accept all cookies|alle akzeptieren|alle cookies akzeptieren|accept|akzeptieren|"
    r"zustimmen|allow all|alle zulassen|agree|i agree|einverstanden)\s*$", re.I)

# Tags every visible form control / button in a frame with an id and describes it.
EXTRACT_JS = r"""
(prefix) => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim().slice(0, 250);
  const labelOf = el => {
    let t = '';
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.innerText; }
    if (!t) { const l = el.closest('label'); if (l) t = l.innerText; }
    if (!t) t = el.getAttribute('aria-label');
    if (!t && el.getAttribute('aria-labelledby'))
      t = el.getAttribute('aria-labelledby').split(/\s+/).map(i => document.getElementById(i)?.innerText || '').join(' ');
    if (!t) t = el.placeholder;
    if (!t) { const c = el.closest('fieldset, .field, .form-group, li, div'); if (c) t = c.innerText; }
    return clean(t);
  };
  const fields = [], buttons = [], groups = {};
  let n = 0;
  document.querySelectorAll('input, select, textarea, [role=combobox]').forEach(el => {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset', 'search'].includes(type)) return;
    if (type !== 'file' && !vis(el)) return;
    const required = el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(labelOf(el));
    if (type === 'radio') {
      const key = el.name || labelOf(el);
      if (!groups[key]) {
        const id = `${prefix}g${n++}`;
        const fs = el.closest('fieldset, [role=radiogroup], .field, .form-group');
        const q = fs ? clean((fs.querySelector('legend, label, .label') || fs).innerText) : key;
        groups[key] = { id, type: 'radio', label: q, required: required || /\*/.test(q), options: [] };
        fields.push(groups[key]);
      }
      const g = groups[key];
      el.setAttribute('data-agent-group', g.id);
      el.setAttribute('data-agent-option', labelOf(el));
      g.options.push(labelOf(el));
      return;
    }
    const id = `${prefix}f${n++}`;
    el.setAttribute('data-agent-id', id);
    const f = { id, type, label: labelOf(el), required, value: el.type === 'file' ? '' : clean(el.value) };
    if (el.tagName === 'SELECT') f.options = [...el.options].map(o => clean(o.text)).filter(Boolean).slice(0, 80);
    if (type === 'checkbox') f.checked = el.checked;
    if (type === 'file') f.accept = el.accept || '';
    fields.push(f);
  });
  document.querySelectorAll('button, input[type=submit], input[type=button], a[role=button], a').forEach(el => {
    if (!vis(el)) return;
    const text = clean(el.innerText || el.value || el.getAttribute('aria-label'));
    if (!text) return;
    if (el.tagName === 'A' && !/apply|bewerb|submit|absenden|senden|next|weiter|continue|fortfahren/i.test(text)) return;
    const id = `${prefix}b${n++}`;
    el.setAttribute('data-agent-btn', id);
    buttons.push({ id, text: text.slice(0, 80) });
  });
  return { fields, buttons: buttons.slice(0, 60) };
}
"""


@dataclass
class ApplyResult:
    status: str  # submitted | ready_dry_run | needs_manual | failed
    reason: str
    screenshot: Path | None = None


def apply(browser: Browser, url: str, profile: str, facts: dict, job, tailored,
          resume_pdf: Path, letter_pdf: Path, out_dir: Path, dry_run: bool) -> ApplyResult:
    context = browser.new_context(locale="en-US", viewport={"width": 1366, "height": 900})
    page = context.new_page()
    shot = out_dir / "screenshot.png"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page = _settle(page)
        _dismiss_cookies(page)
        submitted = False
        for step in range(MAX_STEPS):
            fields, buttons, frames = _extract(page)
            page_text = page.inner_text("body")[:8000]
            if _visible_captcha(page):
                page_text = "[A visible CAPTCHA challenge is on this page]\n" + page_text
            plan = llm.plan_form(profile, facts, job, tailored.cover_letter, page_text, fields, buttons)
            log.info("step %d: %s — %s", step, plan.page_state, plan.notes)

            if plan.page_state == "success":
                page.screenshot(path=str(shot), full_page=True)
                return ApplyResult("submitted", "Confirmation page reached", shot)
            if submitted:
                page.screenshot(path=str(shot), full_page=True)
                return ApplyResult("submitted", f"Submitted, no clear confirmation ({plan.notes})", shot)
            if plan.page_state in ("login_or_account_required", "captcha", "closed_or_error"):
                page.screenshot(path=str(shot), full_page=True)
                return ApplyResult("needs_manual", f"{plan.page_state}: {plan.notes}", shot)
            if plan.unanswerable_required:
                page.screenshot(path=str(shot), full_page=True)
                return ApplyResult("needs_manual", "Missing answers for: " + "; ".join(plan.unanswerable_required), shot)

            for action in plan.actions:
                try:
                    _do(frames, action, resume_pdf, letter_pdf)
                except Exception as e:  # keep going; Claude re-checks the page next step
                    log.warning("action %s on %s failed: %s", action.action, action.field_id, e)

            if not plan.button_id:
                page.screenshot(path=str(shot), full_page=True)
                return ApplyResult("needs_manual", f"No button to continue ({plan.notes})", shot)
            if plan.button_is_final_submit and dry_run:
                page.screenshot(path=str(shot), full_page=True)
                return ApplyResult("ready_dry_run", "Form filled; stopped before final submit (dry run)", shot)

            _locate(frames, plan.button_id, "data-agent-btn").click(timeout=15000)
            page = _settle(page)
            submitted = plan.button_is_final_submit

        page.screenshot(path=str(shot), full_page=True)
        return ApplyResult("needs_manual", "Too many steps", shot)
    except Exception as e:
        log.exception("apply failed")
        try:
            page.screenshot(path=str(shot), full_page=True)
        except Exception:
            shot = None
        return ApplyResult("failed", f"{type(e).__name__}: {e}", shot)
    finally:
        context.close()


def _settle(page: Page) -> Page:
    """Wait for the page to calm down; follow an "Apply" link that opened a new tab."""
    page.wait_for_timeout(1500)
    page = page.context.pages[-1]
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except PWTimeout:
        pass
    return page


def _dismiss_cookies(page: Page):
    for frame in page.frames:
        try:
            for btn in frame.get_by_role("button").all()[:40]:
                if btn.is_visible() and COOKIE_RE.match(btn.inner_text(timeout=1000) or ""):
                    btn.click(timeout=3000)
                    return
        except Exception:
            continue


def _extract(page: Page) -> tuple[list, list, dict[str, Frame]]:
    fields, buttons, frames = [], [], {}
    for i, frame in enumerate(page.frames):
        prefix = f"{i}:"
        try:
            data = frame.evaluate(EXTRACT_JS, prefix)
        except Exception:
            continue
        if data["fields"] or data["buttons"]:
            frames[prefix] = frame
            fields += data["fields"]
            buttons += data["buttons"]
    return fields, buttons, frames


def _visible_captcha(page: Page) -> bool:
    for frame in page.frames:
        if re.search(r"recaptcha/api2/bframe|hcaptcha\.com/captcha|challenges\.cloudflare", frame.url):
            try:
                el = frame.frame_element()
                box = el.bounding_box()
                if box and box["width"] > 100 and box["height"] > 100:
                    return True
            except Exception:
                continue
    return False


def _frame_for(frames: dict[str, Frame], element_id: str) -> Frame:
    return frames[element_id.split(":", 1)[0] + ":"]


def _locate(frames, element_id: str, attr: str):
    return _frame_for(frames, element_id).locator(f'[{attr}="{element_id}"]').first


def _do(frames, action, resume_pdf: Path, letter_pdf: Path):
    fid, kind, value = action.field_id, action.action, action.value
    if kind == "skip":
        return
    if kind in ("upload_resume", "upload_cover_letter"):
        path = resume_pdf if kind == "upload_resume" else letter_pdf
        _locate(frames, fid, "data-agent-id").set_input_files(str(path))
        return
    if ":g" in fid:  # radio group
        frame = _frame_for(frames, fid)
        radios = frame.locator(f'[data-agent-group="{fid}"]')
        for i in range(radios.count()):
            r = radios.nth(i)
            if _same(r.get_attribute("data-agent-option"), value):
                r.check(force=True)
                return
        raise ValueError(f"no radio option {value!r}")
    el = _locate(frames, fid, "data-agent-id")
    if kind == "fill":
        el.fill(value)
    elif kind == "check":
        el.check(force=True)
    elif kind == "uncheck":
        el.uncheck(force=True)
    elif kind == "select":
        tag = el.evaluate("e => e.tagName")
        if tag == "SELECT":
            labels = el.evaluate("e => [...e.options].map(o => o.text.trim())")
            match = next((l for l in labels if _same(l, value)), value)
            el.select_option(label=match)
        else:  # custom combobox (e.g. react-select): type and pick
            el.click()
            el.fill(value)
            frame = _frame_for(frames, fid)
            option = frame.get_by_role("option", name=value).first
            if option.count():
                option.click(timeout=5000)
            else:
                el.press("Enter")


def _same(a: str | None, b: str) -> bool:
    norm = lambda s: re.sub(r"[\s*]+", " ", (s or "")).strip().lower()
    return norm(a) == norm(b) or (norm(b) and norm(b) in norm(a))
