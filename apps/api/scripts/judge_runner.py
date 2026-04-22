#!/usr/bin/env python3
"""Judge script that evaluates user submissions using custom or default evaluation."""

import sys
import os
import json
import pickle
import sqlite3
import traceback
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = APP_ROOT.parent.parent
PRISMA_DIR = WORKSPACE_ROOT / "apps" / "web" / "prisma"


def resolve_db_path() -> Path:
    database_url = os.getenv("DATABASE_URL", "file:./dev.db")
    parsed = urlparse(database_url)
    if parsed.scheme != "file":
        raise RuntimeError("DATABASE_URL must use sqlite file: scheme")

    raw_path = unquote(parsed.path or "")
    if parsed.netloc and parsed.netloc not in ("", "localhost"):
        raw_path = f"//{parsed.netloc}{raw_path}"

    path = Path(raw_path)
    if not path.is_absolute():
        path = (PRISMA_DIR / path).resolve()
    return path


DB_PATH = resolve_db_path()


def get_db_connection():
    return sqlite3.connect(str(DB_PATH))


def get_submission(submission_id: str):
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM Submission WHERE id = ?", (submission_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_contest_info(contest_id: str):
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(
        "SELECT groundTruthPath, evaluateCode FROM Contest WHERE id = ?",
        (contest_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_submission(submission_id: str, status: str, score=None, metrics=None):
    conn = get_db_connection()
    if score is not None:
        metrics_json = json.dumps(metrics) if metrics else None
        conn.execute(
            "UPDATE Submission SET status = ?, score = ?, metrics = ? WHERE id = ?",
            (status, round(score, 2), metrics_json, submission_id)
        )
    else:
        conn.execute(
            "UPDATE Submission SET status = ?, metrics = ? WHERE id = ?",
            (status, json.dumps(metrics) if metrics else None, submission_id)
        )
    conn.commit()
    conn.close()


def run_custom_evaluate(code: str, submission_path: str, answer_path: str):
    """Execute custom evaluate function with restricted globals."""
    import builtins

    ALLOWED_MODULES = {
        "pickle", "numpy", "pandas", "math", "collections", "itertools",
        "functools", "statistics", "decimal", "fractions", "operator",
        "string", "re", "json", "time", "datetime", "copy",
    }

    def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name not in ALLOWED_MODULES and not name.startswith(("numpy.", "pandas.", "collections.", "itertools.", "functools.")):
            raise ImportError(f"Module '{name}' is not allowed in evaluate function")
        return builtins.__import__(name, globals, locals, fromlist, level)

    safe_builtins = dict(builtins.__dict__)
    safe_builtins.pop("eval", None)
    safe_builtins.pop("exec", None)
    safe_builtins.pop("compile", None)
    safe_builtins.pop("input", None)
    safe_builtins.pop("breakpoint", None)
    safe_builtins.pop("help", None)
    safe_builtins["__import__"] = safe_import

    safe_globals = {"__builtins__": safe_builtins, "pickle": pickle}

    try:
        import numpy as np
        safe_globals["np"] = np
        safe_globals["numpy"] = np
    except ImportError:
        pass

    try:
        import pandas as pd
        safe_globals["pd"] = pd
        safe_globals["pandas"] = pd
    except ImportError:
        pass

    local_ns = {}
    exec(code, safe_globals, local_ns)

    if "evaluate" not in local_ns:
        raise ValueError("evaluate function not defined")

    result = local_ns["evaluate"](submission_path, answer_path)

    if isinstance(result, (int, float)):
        return float(result), {}

    if isinstance(result, dict) and "score" in result:
        return float(result["score"]), result.get("metrics", {})

    raise ValueError("evaluate must return a float or dict with 'score' key")


def calculate_default_score(user_data, ground_truth_data):
    """Fallback simple comparison."""
    if isinstance(user_data, dict) and isinstance(ground_truth_data, dict):
        matches = 0
        total = len(ground_truth_data)
        for key in ground_truth_data:
            if key in user_data and user_data[key] == ground_truth_data[key]:
                matches += 1
        return (matches / total * 100) if total > 0 else 0, {}
    elif isinstance(user_data, list) and isinstance(ground_truth_data, list):
        matches = sum(1 for u, g in zip(user_data, ground_truth_data) if u == g)
        total = max(len(user_data), len(ground_truth_data))
        return (matches / total * 100) if total > 0 else 0, {}
    return 0.0, {}


def main():
    if len(sys.argv) < 2:
        print("Usage: judge_runner.py <submission_id>")
        sys.exit(1)

    submission_id = sys.argv[1]
    submission = get_submission(submission_id)

    if not submission:
        print(f"Submission {submission_id} not found")
        sys.exit(1)

    contest_info = get_contest_info(submission["contestId"])
    if not contest_info:
        print(f"Contest not found for submission {submission_id}")
        update_submission(submission_id, "failed")
        sys.exit(1)

    ground_truth_path = contest_info["groundTruthPath"]
    if not ground_truth_path or not os.path.exists(ground_truth_path):
        msg = f"Ground truth not found for contest {submission['contestId']} (path: {ground_truth_path})"
        print(msg)
        update_submission(submission_id, "failed", None, {"error": msg})
        sys.exit(1)

    submission_path = submission["filepath"]
    if not os.path.exists(submission_path):
        print(f"Submission file not found: {submission_path}")
        update_submission(submission_id, "failed")
        sys.exit(1)

    try:
        evaluate_code = contest_info.get("evaluateCode")

        if evaluate_code and evaluate_code.strip():
            print("Using custom evaluate function")
            score, metrics = run_custom_evaluate(
                evaluate_code, submission_path, ground_truth_path
            )
        else:
            print("Using default evaluation (simple comparison)")
            with open(ground_truth_path, "rb") as f:
                ground_truth = pickle.load(f)
            with open(submission_path, "rb") as f:
                user_submission = pickle.load(f)
            score, metrics = calculate_default_score(user_submission, ground_truth)

        update_submission(submission_id, "graded", score, metrics)
        print(f"Submission {submission_id} graded: {score:.2f}")

    except Exception as e:
        error_msg = str(e)
        tb = traceback.format_exc()
        print(f"Error judging submission: {error_msg}")
        print(tb)
        update_submission(submission_id, "failed", None, {"error": error_msg})
        sys.exit(1)


if __name__ == "__main__":
    main()
