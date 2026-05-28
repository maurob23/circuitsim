"""PDF viewer integration for local CircuitSim manuals."""

from __future__ import annotations

import shutil
import subprocess
import os
from pathlib import Path

from services.config import SUMATRAPDF_PATH


def candidate_sumatra_paths():
    configured = Path(SUMATRAPDF_PATH).expanduser()
    if str(configured):
        yield configured

    for env_name in ("ProgramFiles", "ProgramFiles(x86)"):
        base_path = os.environ.get(env_name)
        if base_path:
            yield Path(base_path) / "SumatraPDF" / "SumatraPDF.exe"

    path_exe = shutil.which("SumatraPDF.exe") or shutil.which("SumatraPDF")
    if path_exe:
        yield Path(path_exe)


def resolve_sumatra_path() -> Path | None:
    for candidate in candidate_sumatra_paths():
        if candidate.exists():
            return candidate
    return None


def open_manual(filepath: str, page: int | None = None) -> bool:
    sumatra_path = resolve_sumatra_path()
    if sumatra_path is None:
        return False

    command = [str(sumatra_path), "-reuse-instance"]
    if page is not None:
        command.extend(["-page", str(page)])
    command.append(filepath)

    subprocess.Popen(
        command,
        cwd=str(sumatra_path.parent),
        close_fds=True,
    )
    return True
