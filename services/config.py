"""Local system configuration for external tools and safety limits."""

from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _default_sumatra_path() -> str:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return str(Path(local_app_data) / "SumatraPDF" / "SumatraPDF.exe")
    return r"C:\Program Files\SumatraPDF\SumatraPDF.exe"


LTSPICE_PATH = os.environ.get(
    "LTSPICE_PATH",
    r"C:\Program Files\LTC\LTspiceXVII\XVIIx64.exe",
)
SUMATRAPDF_PATH = os.environ.get(
    "SUMATRAPDF_PATH",
    os.environ.get("SUMATRA_PDF_PATH", _default_sumatra_path()),
)
SOLVER_TIMEOUT_SECONDS = int(os.environ.get("SOLVER_TIMEOUT_SECONDS", "30"))
MAX_COMPONENTS = int(os.environ.get("MAX_COMPONENTS", "200"))
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
DEEPSEEK_TRANSLATION_MODEL = os.environ.get("DEEPSEEK_TRANSLATION_MODEL", "deepseek-v4-flash")
TRANSLATION_TIMEOUT_SECONDS = int(os.environ.get("TRANSLATION_TIMEOUT_SECONDS", "15"))
