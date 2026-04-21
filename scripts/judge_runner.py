#!/usr/bin/env python3
"""Judge script that compares user .pkl submission with admin ground truth."""

import sys
import os
import json
import pickle
from pathlib import Path


def get_submission(submission_id: str):
    """Fetch submission data from SQLite DB."""
    import sqlite3
    db_path = Path(__file__).parent.parent / "prisma" / "dev.db"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM Submission WHERE id = ?", (submission_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_ground_truth_path(contest_id: str):
    """Get ground truth file path for a contest."""
    import sqlite3
    db_path = Path(__file__).parent.parent / "prisma" / "dev.db"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT groundTruthPath FROM Contest WHERE id = ?", (contest_id,))
    row = cursor.fetchone()
    conn.close()
    return row["groundTruthPath"] if row else None


def calculate_score(user_data, ground_truth_data):
    """Compare user predictions with ground truth. Simple accuracy calculation."""
    try:
        if isinstance(user_data, dict) and isinstance(ground_truth_data, dict):
            matches = 0
            total = len(ground_truth_data)
            for key in ground_truth_data:
                if key in user_data and user_data[key] == ground_truth_data[key]:
                    matches += 1
            return (matches / total * 100) if total > 0 else 0
        elif isinstance(user_data, list) and isinstance(ground_truth_data, list):
            matches = sum(1 for u, g in zip(user_data, ground_truth_data) if u == g)
            total = max(len(user_data), len(ground_truth_data))
            return (matches / total * 100) if total > 0 else 0
        else:
            return 0.0
    except Exception:
        return 0.0


def main():
    if len(sys.argv) < 2:
        print("Usage: judge_runner.py <submission_id>")
        sys.exit(1)

    submission_id = sys.argv[1]
    submission = get_submission(submission_id)
    if not submission:
        print(f"Submission {submission_id} not found")
        sys.exit(1)

    ground_truth_path = get_ground_truth_path(submission["contestId"])
    if not ground_truth_path or not os.path.exists(ground_truth_path):
        print(f"Ground truth not found for contest {submission['contestId']}")
        # Update DB as failed
        import sqlite3
        db_path = Path(__file__).parent.parent / "prisma" / "dev.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("UPDATE Submission SET status = 'failed' WHERE id = ?", (submission_id,))
        conn.commit()
        conn.close()
        sys.exit(1)

    try:
        with open(ground_truth_path, "rb") as f:
            ground_truth = pickle.load(f)
        with open(submission["filepath"], "rb") as f:
            user_submission = pickle.load(f)

        score = calculate_score(user_submission, ground_truth)

        # Update DB
        import sqlite3
        db_path = Path(__file__).parent.parent / "prisma" / "dev.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "UPDATE Submission SET status = 'graded', score = ? WHERE id = ?",
            (round(score, 2), submission_id)
        )
        conn.commit()
        conn.close()
        print(f"Submission {submission_id} graded: {score:.2f}")
    except Exception as e:
        print(f"Error judging submission: {e}")
        import sqlite3
        db_path = Path(__file__).parent.parent / "prisma" / "dev.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("UPDATE Submission SET status = 'failed' WHERE id = ?", (submission_id,))
        conn.commit()
        conn.close()
        sys.exit(1)


if __name__ == "__main__":
    main()