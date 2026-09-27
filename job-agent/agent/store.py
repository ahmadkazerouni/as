import sqlite3
from datetime import datetime, timezone

from .config import DATA_DIR

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT,
    company TEXT,
    url TEXT,
    apply_url TEXT,
    score INTEGER,
    status TEXT,
    note TEXT,
    updated_at TEXT
)
"""


class Store:
    def __init__(self):
        self.db = sqlite3.connect(DATA_DIR / "jobs.db")
        self.db.execute(SCHEMA)

    def seen(self, job_id: str) -> bool:
        return self.db.execute("SELECT 1 FROM jobs WHERE id = ?", (job_id,)).fetchone() is not None

    def save(self, job, status: str, score: int | None = None, note: str = ""):
        self.db.execute(
            "INSERT OR REPLACE INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job.id, job.title, job.company, job.url, job.apply_url, score, status, note,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        self.db.commit()

    def applied_today(self) -> int:
        today = datetime.now(timezone.utc).date().isoformat()
        row = self.db.execute(
            "SELECT COUNT(*) FROM jobs WHERE status IN ('submitted', 'ready_dry_run') "
            "AND updated_at >= ?",
            (today,),
        ).fetchone()
        return row[0]
