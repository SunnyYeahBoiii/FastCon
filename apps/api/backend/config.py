from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = APP_ROOT.parent.parent
WEB_APP_ROOT = WORKSPACE_ROOT / "apps" / "web"
PRISMA_DIR = WEB_APP_ROOT / "prisma"


def _read_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def _read_int(primary: str, default: int, alias: str | None = None) -> int:
    raw = _read_env(primary) or (_read_env(alias) if alias else None)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def get_database_url() -> str:
    url = _read_env("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be set")
    return url


def get_sqlite_path() -> Path:
    database_url = get_database_url()
    parsed = urlparse(database_url)
    if parsed.scheme != "file":
        raise RuntimeError("Only sqlite DATABASE_URL values using the file: scheme are supported")

    raw_path = unquote(parsed.path or "")
    if parsed.netloc and parsed.netloc not in {"", "localhost"}:
        raw_path = f"//{parsed.netloc}{raw_path}"

    if raw_path == ":memory:":
        raise RuntimeError("In-memory sqlite is not supported for the FastAPI worker")

    path = Path(raw_path)
    if not path.is_absolute():
        path = (PRISMA_DIR / path).resolve()
    return path


def _resolve_from_workspace(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (WORKSPACE_ROOT / path).resolve()


def get_storage_root() -> Path:
    storage_root = _read_env("STORAGE_ROOT")
    if storage_root:
        return _resolve_from_workspace(storage_root)

    upload_dir = _read_env("UPLOAD_DIR")
    if upload_dir:
        return _resolve_from_workspace(upload_dir).parent

    return (WORKSPACE_ROOT / "storage").resolve()


def get_submissions_root() -> Path:
    return get_storage_root() / "submissions"


def get_testdata_root() -> Path:
    return get_storage_root() / "testdata"


def get_python_bin() -> str:
    return _read_env("PYTHON_BIN") or "python3"


def get_worker_poll_ms() -> int:
    return _read_int("WORKER_POLL_MS", 1000)


def get_worker_max_concurrent() -> int:
    return _read_int("WORKER_MAX_CONCURRENT", 3, alias="MAX_CONCURRENT_JUDGES")


def get_judge_timeout_seconds() -> int:
    return _read_int("JUDGE_TIMEOUT_SECONDS", 120)


def get_max_upload_bytes() -> int:
    return _read_int("MAX_UPLOAD_BYTES", 10 * 1024 * 1024)
