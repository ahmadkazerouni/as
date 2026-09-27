import logging
import os
from pathlib import Path

import requests

log = logging.getLogger(__name__)


def notify(text: str, files: list[Path] | None = None):
    """Send a Telegram message (and files) if configured; always log it."""
    log.info("NOTIFY: %s", text)
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    base = f"https://api.telegram.org/bot{token}"
    try:
        requests.post(f"{base}/sendMessage", data={"chat_id": chat_id, "text": text[:4000],
                                                  "disable_web_page_preview": True}, timeout=30)
        for f in files or []:
            if not f or not Path(f).exists():
                continue
            method, field = ("sendPhoto", "photo") if str(f).endswith(".png") else ("sendDocument", "document")
            with open(f, "rb") as fh:
                requests.post(f"{base}/{method}", data={"chat_id": chat_id}, files={field: fh}, timeout=60)
    except requests.RequestException as e:
        log.warning("Telegram failed: %s", e)
