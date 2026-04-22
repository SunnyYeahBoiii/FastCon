from __future__ import annotations

from datetime import date, datetime
from typing import Any


def _serialize_datetime(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()).isoformat()
    return value


def user_submission_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "status": row["status"],
        "score": row["score"],
        "metrics": row["metrics"],
        "createdAt": _serialize_datetime(row["createdAt"]),
        "contest": {
            "id": row["contestId"],
            "title": row["contestTitle"],
        },
    }


def admin_submission_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "userId": row["userId"],
        "contestId": row["contestId"],
        "filename": row["filename"],
        "filepath": row["filepath"],
        "status": row["status"],
        "score": row["score"],
        "metrics": row["metrics"],
        "createdAt": _serialize_datetime(row["createdAt"]),
        "user": {
            "id": row["user_id"],
            "name": row["user_name"],
            "username": row["user_username"],
        },
        "contest": {
            "id": row["contest_id"],
            "title": row["contest_title"],
        },
    }


def submission_detail_payload(row: dict[str, Any]) -> dict[str, Any]:
    return admin_submission_payload(row)


def submission_update_payload(row: dict[str, Any] | None, submission_id: str, fallback_status: str) -> dict[str, Any]:
    if row is None:
        return {
            "type": "status_change",
            "submissionId": submission_id,
            "status": fallback_status,
            "score": None,
            "metrics": None,
        }

    return {
        "type": "status_change",
        "submissionId": submission_id,
        "status": row["status"] or fallback_status,
        "score": row["score"],
        "metrics": row["metrics"],
    }


def quota_snapshot_payload(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "contestId": snapshot["contestId"],
        "dailySubmissionLimit": snapshot["dailySubmissionLimit"],
        "used": snapshot["used"],
        "remaining": snapshot["remaining"],
        "windowStartedAt": _serialize_datetime(snapshot["windowStartedAt"]),
        "resetAt": _serialize_datetime(snapshot["resetAt"]),
        "isLimited": snapshot["isLimited"],
        "isQuotaExceeded": snapshot["isQuotaExceeded"],
    }


def get_points_from_rank(rank: int) -> int:
    if rank == 1:
        return 10
    if rank <= 3:
        return 9
    if rank <= 6:
        return 8
    if rank <= 11:
        return 7
    return 0


def build_leaderboard(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best_scores: dict[str, dict[str, Any]] = {}

    for row in rows:
        key = row["userId"]
        existing = best_scores.get(key)
        score = float(row["score"])
        if existing is None or score > existing["score"]:
            best_scores[key] = {
                "userId": row["userId"],
                "userName": row["userName"],
                "contestId": row["contestId"],
                "contestTitle": row["contestTitle"],
                "score": score,
                "submissionCount": (existing["submissionCount"] + 1) if existing else 1,
            }

    with_points = [
        {
            "rank": index + 1,
            "recordPoints": get_points_from_rank(index + 1),
            **entry,
        }
        for index, entry in enumerate(
            sorted(best_scores.values(), key=lambda entry: entry["score"], reverse=True)
        )
    ]

    leaderboard = sorted(
        with_points,
        key=lambda entry: (entry["recordPoints"], entry["score"]),
        reverse=True,
    )

    return [
        {
            **entry,
            "rank": index + 1,
            "recordPoints": get_points_from_rank(index + 1),
        }
        for index, entry in enumerate(leaderboard)
    ]
