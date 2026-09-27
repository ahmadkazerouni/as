"""All Claude calls: job scoring, resume tailoring and form filling."""

import json
import logging
import os
from typing import Literal

import anthropic
from pydantic import BaseModel

log = logging.getLogger(__name__)

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5")
_client = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


class RefusedError(RuntimeError):
    pass


def _parse(schema: type[BaseModel], system: str, prompt: str, effort: str, max_tokens: int = 16000):
    # fallbacks="default": if a safety classifier declines, the API re-runs the
    # request on Anthropic's recommended fallback model inside the same call.
    response = client().beta.messages.parse(
        model=MODEL,
        max_tokens=max_tokens,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": effort},
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
    )
    if response.stop_reason == "refusal":
        raise RefusedError(str(response.stop_details))
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise RuntimeError(f"Claude returned no parsable output (stop_reason={response.stop_reason})")
    return response.parsed_output


NO_INVENTION = (
    "Use ONLY facts found in the candidate profile and application facts. You may rephrase, "
    "reorder, translate and emphasise, but never invent employers, titles, dates, degrees, "
    "numbers, tools, certifications or language levels. Lines marked TODO are unknown: ignore them."
)


# ---------------------------------------------------------------- scoring

class JobScore(BaseModel):
    score: int  # 0-100
    is_product_role: bool
    job_language: Literal["en", "de", "other"]
    german_required: bool
    reasons: str


def score_job(profile: str, job) -> JobScore:
    system = (
        "You screen job postings for a candidate moving from senior operations / customer "
        "experience leadership in fintech (BNPL) into product roles in Germany. Score 0-100 how "
        "worthwhile it is to apply: role is genuinely a product role (PM, PO, product ops, "
        "product lead), seniority fits someone with ~12 years of leadership experience but new "
        "to a formal PM title, domain fit (fintech, payments, CX, operations tooling, "
        "marketplaces) raises the score, fluent-German-required lowers it unless the profile "
        "shows German. Be honest and strict."
    )
    prompt = (
        f"<profile>\n{profile}\n</profile>\n\n<job>\nTitle: {job.title}\nCompany: {job.company}\n"
        f"Location: {job.location}\n\n{job.description[:12000]}\n</job>"
    )
    return _parse(JobScore, system, prompt, effort="low", max_tokens=4000)


# ---------------------------------------------------------------- resume

class ExperienceEntry(BaseModel):
    title: str
    company: str
    dates: str
    location: str
    bullets: list[str]


class EducationEntry(BaseModel):
    degree: str
    school: str
    dates: str


class TailoredApplication(BaseModel):
    language: Literal["en", "de"]
    headline: str
    summary: str
    skills: list[str]
    experience: list[ExperienceEntry]
    education: list[EducationEntry]
    languages: list[str]
    cover_letter: str


def tailor(profile: str, facts: dict, job, language: str) -> TailoredApplication:
    system = (
        "You are an expert resume writer for product management roles in Germany. Produce a "
        "one-to-two page resume and a cover letter tailored to the job below. Frame the "
        "candidate's operations and customer-experience leadership as product-relevant "
        "experience (customer insight, process and tooling improvements, cross-functional work "
        "with engineering, metrics ownership) wherever the profile supports it. Mirror the job's "
        "keywords where truthful so ATS filters match. German-market conventions: no photo, "
        "concise bullets, reverse-chronological. The cover letter: 200-300 words, specific to "
        "the company and role, no clichés, no placeholders like [Company].\n\n" + NO_INVENTION
    )
    prompt = (
        f"Write everything in {'German' if language == 'de' else 'English'}.\n\n"
        f"<profile>\n{profile}\n</profile>\n\n"
        f"<application_facts>\n{json.dumps(facts, ensure_ascii=False, indent=2)}\n</application_facts>\n\n"
        f"<job>\nTitle: {job.title}\nCompany: {job.company}\nLocation: {job.location}\n\n"
        f"{job.description[:15000]}\n</job>"
    )
    return _parse(TailoredApplication, system, prompt, effort="high")


# ---------------------------------------------------------------- forms

class FieldAction(BaseModel):
    field_id: str
    action: Literal["fill", "select", "check", "uncheck", "upload_resume", "upload_cover_letter", "skip"]
    value: str


class FormPlan(BaseModel):
    page_state: Literal["application_form", "needs_apply_click", "login_or_account_required",
                        "captcha", "success", "closed_or_error", "other"]
    actions: list[FieldAction]
    unanswerable_required: list[str]  # labels of required fields we have no truthful answer for
    button_id: str  # button/link to click after filling ("" if none)
    button_is_final_submit: bool
    notes: str


def plan_form(profile: str, facts: dict, job, cover_letter: str, page_text: str, fields: list, buttons: list) -> FormPlan:
    system = (
        "You operate a job application web page for the candidate. You get the page's visible "
        "text, its form fields and its buttons (each with an id). Decide the page state and, "
        "for an application form, how to fill every field.\n"
        "- 'fill' for text/textarea/email/tel/date inputs (value = text). For a cover letter "
        "or motivation textarea, use the provided cover letter.\n"
        "- 'select' for dropdowns and radio groups (value = the exact option label).\n"
        "- 'check'/'uncheck' for checkboxes. Accept privacy-policy / data-processing consent "
        "checkboxes that are required to apply. Leave marketing / talent-pool opt-ins unchecked.\n"
        "- 'upload_resume' / 'upload_cover_letter' for file inputs (value empty).\n"
        "- 'skip' for optional fields you have no information for.\n"
        "- If a REQUIRED field asks for something not in the profile or facts (or the fact is "
        "empty), list its label in unanswerable_required instead of guessing. Voluntary EEO / "
        "diversity questions: choose 'prefer not to say' style options when present.\n"
        "- button_id: the button to press next. If the page is a job ad with an 'Apply' / "
        "'Bewerben' button, state needs_apply_click and give that button. If it's the final "
        "'Submit application' / 'Bewerbung absenden', set button_is_final_submit=true.\n\n"
        + NO_INVENTION
    )
    prompt = (
        f"<profile>\n{profile}\n</profile>\n\n"
        f"<application_facts>\n{json.dumps(facts, ensure_ascii=False, indent=2)}\n</application_facts>\n\n"
        f"<job>{job.title} at {job.company}</job>\n\n"
        f"<cover_letter>\n{cover_letter}\n</cover_letter>\n\n"
        f"<page_text>\n{page_text[:8000]}\n</page_text>\n\n"
        f"<fields>\n{json.dumps(fields, ensure_ascii=False, indent=1)}\n</fields>\n\n"
        f"<buttons>\n{json.dumps(buttons, ensure_ascii=False, indent=1)}\n</buttons>"
    )
    return _parse(FormPlan, system, prompt, effort="medium")
