from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


@dataclass
class Config:
    raw: dict
    profile: str

    @property
    def mode(self) -> str:
        return self.raw.get("mode", "dry_run")

    @property
    def dry_run(self) -> bool:
        return self.mode != "auto"

    @property
    def searches(self) -> dict:
        return self.raw["searches"]

    @property
    def facts(self) -> dict:
        return self.raw.get("application_facts", {})

    def __getattr__(self, name):
        try:
            return self.raw[name]
        except KeyError:
            raise AttributeError(name) from None


def load_config(path: Path | None = None) -> Config:
    load_dotenv(ROOT / ".env")
    path = path or ROOT / "config.yaml"
    if not path.exists():
        raise SystemExit(f"{path} not found. Copy config.example.yaml to config.yaml first.")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    profile = (ROOT / "profile" / "master_profile.md").read_text(encoding="utf-8")
    DATA_DIR.mkdir(exist_ok=True)
    return Config(raw=raw, profile=profile)
