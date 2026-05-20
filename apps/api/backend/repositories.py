from __future__ import annotations

import asyncio
import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import aiosqlite

from .config import get_sqlite_path

QUOTA_WINDOW_DURATION = timedelta(hours=24)
QUOTA_USAGE_PENDING = "pending"
QUOTA_USAGE_COUNTED = "counted"
QUOTA_USAGE_REFUNDED = "refunded"
_runtime_schema_path: Path | None = None
_runtime_schema_lock = asyncio.Lock()


def _submission_id() -> str:
    return f"c{secrets.token_hex(12)}"


def _row_to_dict(row: aiosqlite.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_submission_limit(limit: Any) -> int | None:
    if not isinstance(limit, int):
        return None
    return limit if limit > 0 else None


def _coerce_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, (int, float)):
        # Prisma SQLite stores DateTime as milliseconds since epoch.
        timestamp = float(value)
        if timestamp >= 1_000_000_000_000:
            parsed = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        elif timestamp >= 1_000_000_000:
            parsed = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        else:
            raise TypeError(f"Unsupported datetime value: {value!r}")
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped.isdigit():
            return _coerce_datetime(int(stripped))
        parsed = datetime.fromisoformat(stripped.replace("Z", "+00:00"))
    else:
        raise TypeError(f"Unsupported datetime value: {value!r}")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _build_quota_snapshot(
    *,
    contest_id: str,
    daily_submission_limit: Any,
    contest_deadline: Any,
    window_started_at: Any,
    submission_count: Any,
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = now or _utc_now()
    deadline = _coerce_datetime(contest_deadline)
    is_deadline_passed = deadline is not None and current_time > deadline
    limit = _normalize_submission_limit(daily_submission_limit)
    if limit is None:
        return {
            "contestId": contest_id,
            "dailySubmissionLimit": None,
            "deadline": deadline,
            "serverNow": current_time,
            "isDeadlinePassed": is_deadline_passed,
            "used": 0,
            "remaining": None,
            "windowStartedAt": None,
            "resetAt": None,
            "isLimited": False,
            "isQuotaExceeded": False,
        }

    started_at = _coerce_datetime(window_started_at)
    if started_at is None:
        return {
            "contestId": contest_id,
            "dailySubmissionLimit": limit,
            "deadline": deadline,
            "serverNow": current_time,
            "isDeadlinePassed": is_deadline_passed,
            "used": 0,
            "remaining": limit,
            "windowStartedAt": None,
            "resetAt": None,
            "isLimited": True,
            "isQuotaExceeded": False,
        }

    reset_at = started_at + QUOTA_WINDOW_DURATION
    if current_time >= reset_at:
        return {
            "contestId": contest_id,
            "dailySubmissionLimit": limit,
            "deadline": deadline,
            "serverNow": current_time,
            "isDeadlinePassed": is_deadline_passed,
            "used": 0,
            "remaining": limit,
            "windowStartedAt": None,
            "resetAt": None,
            "isLimited": True,
            "isQuotaExceeded": False,
        }

    used = int(submission_count or 0)
    remaining = max(0, limit - used)
    return {
        "contestId": contest_id,
        "dailySubmissionLimit": limit,
        "deadline": deadline,
        "serverNow": current_time,
        "isDeadlinePassed": is_deadline_passed,
        "used": used,
        "remaining": remaining,
        "windowStartedAt": started_at,
        "resetAt": reset_at,
        "isLimited": True,
        "isQuotaExceeded": used >= limit,
    }


async def _ensure_submission_quota_usage_state_column(
    connection: aiosqlite.Connection,
) -> None:
    cursor = await connection.execute('PRAGMA table_info("Submission")')
    columns = {row["name"] for row in await cursor.fetchall()}
    if "quotaUsageState" in columns:
        return

    await connection.execute(
        'ALTER TABLE "Submission" ADD COLUMN "quotaUsageState" TEXT NOT NULL DEFAULT \'pending\''
    )
    await connection.execute(
        '''
        UPDATE "Submission"
        SET "quotaUsageState" = CASE
          WHEN "status" = 'graded' AND "score" IS NOT NULL THEN 'counted'
          WHEN "status" = 'failed' THEN 'refunded'
          ELSE 'pending'
        END
        '''
    )


async def _ensure_submission_upload_progress_columns(
    connection: aiosqlite.Connection,
) -> None:
    cursor = await connection.execute('PRAGMA table_info("Submission")')
    columns = {row["name"] for row in await cursor.fetchall()}

    if "uploadTotalBytes" not in columns:
        await connection.execute(
            'ALTER TABLE "Submission" ADD COLUMN "uploadTotalBytes" INTEGER'
        )

    if "uploadReceivedBytes" not in columns:
        await connection.execute(
            'ALTER TABLE "Submission" ADD COLUMN "uploadReceivedBytes" INTEGER NOT NULL DEFAULT 0'
        )


async def _count_active_quota_usage(
    connection: aiosqlite.Connection,
    *,
    user_id: str,
    contest_id: str,
    window_started_at: Any,
) -> int:
    started_at = _coerce_datetime(window_started_at)
    if started_at is None:
        return 0

    cursor = await connection.execute(
        '''
        SELECT COUNT(*) AS "used"
        FROM "Submission"
        WHERE "userId" = ?
          AND "contestId" = ?
          AND "quotaUsageState" IN ('pending', 'counted')
          AND datetime("createdAt") >= datetime(?)
        ''',
        (user_id, contest_id, started_at.isoformat()),
    )
    row = await cursor.fetchone()
    return int(row["used"] if row else 0)


@asynccontextmanager
async def open_connection() -> AsyncIterator[aiosqlite.Connection]:
    connection = await aiosqlite.connect(get_sqlite_path(), timeout=30)
    connection.row_factory = aiosqlite.Row
    try:
        yield connection
    finally:
        await connection.close()


async def ensure_submission_quota_schema(connection: aiosqlite.Connection) -> None:
    await _ensure_submission_quota_usage_state_column(connection)
    await _ensure_submission_upload_progress_columns(connection)
    await connection.execute(
        '''
        CREATE TABLE IF NOT EXISTS "SubmissionQuotaWindow" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "contestId" TEXT NOT NULL,
          "windowStartedAt" DATETIME NOT NULL,
          "submissionCount" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SubmissionQuotaWindow_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "SubmissionQuotaWindow_contestId_fkey"
            FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
        '''
    )
    await connection.execute(
        '''
        CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionQuotaWindow_userId_contestId_key"
        ON "SubmissionQuotaWindow" ("userId", "contestId")
        '''
    )
    await connection.execute(
        '''
        CREATE INDEX IF NOT EXISTS "Submission_userId_contestId_createdAt_idx"
        ON "Submission" ("userId", "contestId", "createdAt")
        '''
    )
    await connection.commit()


async def ensure_runtime_schema() -> None:
    global _runtime_schema_path

    sqlite_path = get_sqlite_path()
    if _runtime_schema_path == sqlite_path:
        return

    async with _runtime_schema_lock:
        if _runtime_schema_path == sqlite_path:
            return

        async with open_connection() as connection:
            await ensure_submission_quota_schema(connection)
        _runtime_schema_path = sqlite_path


async def fetch_user_by_session(session_id: str) -> dict[str, Any] | None:
    async with open_connection() as connection:
        cursor = await connection.execute(
            'SELECT "id", "username", "name", "role" FROM "User" WHERE "id" = ?',
            (session_id,),
        )
        return _row_to_dict(await cursor.fetchone())


async def fetch_contest(contest_id: str) -> dict[str, Any] | None:
    async with open_connection() as connection:
        cursor = await connection.execute(
            'SELECT "id", "title", "status", "deadline", "dailySubmissionLimit" FROM "Contest" WHERE "id" = ?',
            (contest_id,),
        )
        return _row_to_dict(await cursor.fetchone())


async def fetch_admin_submissions() -> list[dict[str, Any]]:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            SELECT
              s."id",
              s."userId",
              s."contestId",
              s."filename",
              s."filepath",
              s."status",
              s."score",
              s."metrics",
              s."createdAt",
              u."id" AS user_id,
              u."name" AS user_name,
              u."username" AS user_username,
              c."id" AS contest_id,
              c."title" AS contest_title
            FROM "Submission" s
            JOIN "User" u ON u."id" = s."userId"
            JOIN "Contest" c ON c."id" = s."contestId"
            ORDER BY s."createdAt" DESC
            '''
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def fetch_submission_detail(submission_id: str) -> dict[str, Any] | None:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            SELECT
              s."id",
              s."userId",
              s."contestId",
              s."filename",
              s."filepath",
              s."status",
              s."score",
              s."metrics",
              s."createdAt",
              u."id" AS user_id,
              u."name" AS user_name,
              u."username" AS user_username,
              c."id" AS contest_id,
              c."title" AS contest_title
            FROM "Submission" s
            JOIN "User" u ON u."id" = s."userId"
            JOIN "Contest" c ON c."id" = s."contestId"
            WHERE s."id" = ?
            ''',
            (submission_id,),
        )
        return _row_to_dict(await cursor.fetchone())


async def fetch_user_submissions(user_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    query = '''
        SELECT
          s."id",
          s."filename",
          s."status",
          s."score",
          s."metrics",
          s."createdAt",
          c."id" AS contestId,
          c."title" AS contestTitle
        FROM "Submission" s
        JOIN "Contest" c ON c."id" = s."contestId"
        WHERE s."userId" = ?
        ORDER BY s."createdAt" DESC
    '''
    params: tuple[Any, ...]
    if limit is None:
        params = (user_id,)
    else:
        query += " LIMIT ?"
        params = (user_id, limit)

    async with open_connection() as connection:
        cursor = await connection.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def fetch_submission_quota(user_id: str, contest_id: str) -> dict[str, Any] | None:
    contest = await fetch_contest(contest_id)
    if contest is None:
        return None

    await ensure_runtime_schema()
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            SELECT
              "windowStartedAt",
              "submissionCount"
            FROM "SubmissionQuotaWindow"
            WHERE "userId" = ? AND "contestId" = ?
            ''',
            (user_id, contest_id),
        )
        quota_row = _row_to_dict(await cursor.fetchone())
        quota_usage_count = await _count_active_quota_usage(
            connection,
            user_id=user_id,
            contest_id=contest_id,
            window_started_at=quota_row["windowStartedAt"] if quota_row else None,
        )

    return _build_quota_snapshot(
        contest_id=contest_id,
        daily_submission_limit=contest["dailySubmissionLimit"],
        contest_deadline=contest["deadline"],
        window_started_at=quota_row["windowStartedAt"] if quota_row else None,
        submission_count=quota_usage_count,
    )


async def create_submission_with_quota(
    *,
    user_id: str,
    contest_id: str,
    filename: str,
    filepath: str,
    initial_status: str = "queued",
    upload_total_bytes: int | None = None,
) -> dict[str, Any]:
    submission_id = _submission_id()
    now = _utc_now()
    now_iso = now.isoformat()

    await ensure_runtime_schema()
    async with open_connection() as connection:
        await connection.execute("BEGIN IMMEDIATE")

        contest_cursor = await connection.execute(
            'SELECT "id", "status", "dailySubmissionLimit", "deadline" FROM "Contest" WHERE "id" = ?',
            (contest_id,),
        )
        contest = _row_to_dict(await contest_cursor.fetchone())
        if contest is None:
            await connection.rollback()
            return {"ok": False, "reason": "contest_not_found"}

        contest_status = str(contest.get("status") or "ongoing").strip().lower()
        if contest_status == "completed":
            quota_snapshot = _build_quota_snapshot(
                contest_id=contest_id,
                daily_submission_limit=contest["dailySubmissionLimit"],
                contest_deadline=contest["deadline"],
                window_started_at=None,
                submission_count=0,
                now=now,
            )
            await connection.rollback()
            return {
                "ok": False,
                "reason": "contest_closed",
                "quota": quota_snapshot,
            }

        deadline = _coerce_datetime(contest["deadline"])
        if deadline is not None and now > deadline:
            quota_snapshot = _build_quota_snapshot(
                contest_id=contest_id,
                daily_submission_limit=contest["dailySubmissionLimit"],
                contest_deadline=contest["deadline"],
                window_started_at=None,
                submission_count=0,
                now=now,
            )
            await connection.rollback()
            return {
                "ok": False,
                "reason": "deadline_passed",
                "quota": quota_snapshot,
            }

        limit = _normalize_submission_limit(contest["dailySubmissionLimit"])
        quota_snapshot: dict[str, Any]
        if limit is not None:
            quota_cursor = await connection.execute(
                '''
                SELECT
                  "id",
                  "windowStartedAt",
                  "submissionCount"
                FROM "SubmissionQuotaWindow"
                WHERE "userId" = ? AND "contestId" = ?
                ''',
                (user_id, contest_id),
            )
            quota_row = _row_to_dict(await quota_cursor.fetchone())
            quota_usage_count = await _count_active_quota_usage(
                connection,
                user_id=user_id,
                contest_id=contest_id,
                window_started_at=quota_row["windowStartedAt"] if quota_row else None,
            )

            current_quota = _build_quota_snapshot(
                contest_id=contest_id,
                daily_submission_limit=limit,
                contest_deadline=contest["deadline"],
                window_started_at=quota_row["windowStartedAt"] if quota_row else None,
                submission_count=quota_usage_count,
                now=now,
            )
            if current_quota["isQuotaExceeded"]:
                await connection.rollback()
                return {
                    "ok": False,
                    "reason": "submission_limit_reached",
                    "quota": current_quota,
                }

            if quota_row is None:
                await connection.execute(
                    '''
                    INSERT INTO "SubmissionQuotaWindow" (
                      "id",
                      "userId",
                      "contestId",
                      "windowStartedAt",
                      "submissionCount",
                      "updatedAt"
                    )
                    VALUES (?, ?, ?, ?, 1, ?)
                    ''',
                    (_submission_id(), user_id, contest_id, now_iso, now_iso),
                )
                quota_snapshot = _build_quota_snapshot(
                    contest_id=contest_id,
                    daily_submission_limit=limit,
                    contest_deadline=contest["deadline"],
                    window_started_at=now,
                    submission_count=1,
                    now=now,
                )
            elif current_quota["windowStartedAt"] is None:
                await connection.execute(
                    '''
                    UPDATE "SubmissionQuotaWindow"
                    SET "windowStartedAt" = ?, "submissionCount" = 1, "updatedAt" = ?
                    WHERE "id" = ?
                    ''',
                    (now_iso, now_iso, quota_row["id"]),
                )
                quota_snapshot = _build_quota_snapshot(
                    contest_id=contest_id,
                    daily_submission_limit=limit,
                    contest_deadline=contest["deadline"],
                    window_started_at=now,
                    submission_count=1,
                    now=now,
                )
            else:
                new_submission_count = quota_usage_count + 1
                await connection.execute(
                    '''
                    UPDATE "SubmissionQuotaWindow"
                    SET "submissionCount" = ?, "updatedAt" = ?
                    WHERE "id" = ?
                    ''',
                    (new_submission_count, now_iso, quota_row["id"]),
                )
                quota_snapshot = _build_quota_snapshot(
                    contest_id=contest_id,
                    daily_submission_limit=limit,
                    contest_deadline=contest["deadline"],
                    window_started_at=quota_row["windowStartedAt"],
                    submission_count=new_submission_count,
                    now=now,
                )
        else:
            quota_snapshot = _build_quota_snapshot(
                contest_id=contest_id,
                daily_submission_limit=None,
                contest_deadline=contest["deadline"],
                window_started_at=None,
                submission_count=0,
                now=now,
            )

        await connection.execute(
            '''
            INSERT INTO "Submission" (
              "id",
              "userId",
              "contestId",
              "filename",
              "filepath",
              "status",
              "uploadTotalBytes",
              "uploadReceivedBytes",
              "quotaUsageState"
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending')
            ''',
            (
                submission_id,
                user_id,
                contest_id,
                filename,
                filepath,
                initial_status,
                upload_total_bytes,
            ),
        )
        await connection.commit()
    return {"ok": True, "submissionId": submission_id, "quota": quota_snapshot}


async def prepare_submission_upload_with_quota(
    *,
    user_id: str,
    contest_id: str,
    filename: str,
    filepath: str,
    upload_total_bytes: int | None = None,
) -> dict[str, Any]:
    return await create_submission_with_quota(
        user_id=user_id,
        contest_id=contest_id,
        filename=filename,
        filepath=filepath,
        initial_status="uploading",
        upload_total_bytes=upload_total_bytes,
    )


async def fetch_pending_submission_upload(
    submission_id: str,
    *,
    user_id: str,
) -> dict[str, Any] | None:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            SELECT
              "id",
              "userId",
              "contestId",
              "filename",
              "filepath",
              "status",
              "uploadTotalBytes",
              "uploadReceivedBytes"
            FROM "Submission"
            WHERE "id" = ? AND "userId" = ? AND "status" = 'uploading'
            ''',
            (submission_id, user_id),
        )
        return _row_to_dict(await cursor.fetchone())


async def update_submission_upload_progress(
    submission_id: str,
    *,
    user_id: str,
    received_bytes: int,
) -> bool:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            UPDATE "Submission"
            SET "uploadReceivedBytes" = MAX("uploadReceivedBytes", ?)
            WHERE "id" = ? AND "userId" = ? AND "status" = 'uploading'
            ''',
            (received_bytes, submission_id, user_id),
        )
        await connection.commit()
        return cursor.rowcount == 1


async def complete_submission_upload(submission_id: str, *, user_id: str) -> bool:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            UPDATE "Submission"
            SET "status" = 'queued'
            WHERE "id" = ? AND "userId" = ? AND "status" = 'uploading'
            ''',
            (submission_id, user_id),
        )
        await connection.commit()
        return cursor.rowcount == 1


async def fail_submission_upload(
    submission_id: str,
    *,
    user_id: str,
    message: str,
) -> bool:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            UPDATE "Submission"
            SET
              "status" = 'failed',
              "metrics" = ?,
              "quotaUsageState" = 'refunded'
            WHERE "id" = ? AND "userId" = ? AND "status" = 'uploading'
            ''',
            (json.dumps({"error": message}), submission_id, user_id),
        )
        await connection.commit()
        return cursor.rowcount == 1


async def fail_stale_submission_uploads(
    *,
    older_than: datetime,
    message: str,
) -> list[dict[str, Any]]:
    metrics = json.dumps({"error": message})
    await ensure_runtime_schema()
    async with open_connection() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        cursor = await connection.execute(
            '''
            SELECT "id", "userId", "filepath"
            FROM "Submission"
            WHERE "status" = 'uploading'
              AND datetime("createdAt") < datetime(?)
            ORDER BY "createdAt" ASC
            ''',
            (older_than.isoformat(),),
        )
        rows = [dict(row) for row in await cursor.fetchall()]
        if not rows:
            await connection.commit()
            return []

        await connection.execute(
            '''
            UPDATE "Submission"
            SET
              "status" = 'failed',
              "metrics" = ?,
              "quotaUsageState" = 'refunded'
            WHERE "status" = 'uploading'
              AND datetime("createdAt") < datetime(?)
            ''',
            (metrics, older_than.isoformat()),
        )
        await connection.commit()

    return [
        {
            **row,
            "status": "failed",
            "score": None,
            "metrics": metrics,
        }
        for row in rows
    ]


async def reset_running_submissions() -> None:
    async with open_connection() as connection:
        await connection.execute(
            'UPDATE "Submission" SET "status" = \'queued\' WHERE "status" = \'running\''
        )
        await connection.execute(
            '''
            UPDATE "Submission"
            SET
              "status" = 'failed',
              "metrics" = ?,
              "quotaUsageState" = 'refunded'
            WHERE "status" = 'uploading'
            ''',
            (json.dumps({"error": "Upload interrupted before the API restarted"}),),
        )
        await connection.commit()


async def claim_next_queued_submission() -> dict[str, Any] | None:
    async with open_connection() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        cursor = await connection.execute(
            '''
            SELECT "id", "userId"
            FROM "Submission"
            WHERE "status" = 'queued'
            ORDER BY "createdAt" ASC
            LIMIT 1
            '''
        )
        row = await cursor.fetchone()
        if row is None:
            await connection.commit()
            return None

        update_cursor = await connection.execute(
            '''
            UPDATE "Submission"
            SET "status" = 'running'
            WHERE "id" = ? AND "status" = 'queued'
            ''',
            (row["id"],),
        )
        if update_cursor.rowcount != 1:
            await connection.rollback()
            return None

        await connection.commit()
        return {"id": row["id"], "userId": row["userId"]}


async def fetch_submission_status(submission_id: str) -> dict[str, Any] | None:
    async with open_connection() as connection:
        cursor = await connection.execute(
            'SELECT "id", "userId", "status", "score", "metrics" FROM "Submission" WHERE "id" = ?',
            (submission_id,),
        )
        return _row_to_dict(await cursor.fetchone())


async def requeue_submission(submission_id: str) -> bool:
    async with open_connection() as connection:
        cursor = await connection.execute(
            '''
            UPDATE "Submission"
            SET "status" = 'queued', "score" = NULL, "metrics" = NULL
            WHERE "id" = ?
            ''',
            (submission_id,),
        )
        await connection.commit()
        return cursor.rowcount == 1


async def update_submission_result(
    submission_id: str,
    *,
    status: str,
    score: float | None,
    metrics: str | None,
) -> None:
    await ensure_runtime_schema()
    async with open_connection() as connection:
        await connection.execute(
            '''
            UPDATE "Submission"
            SET
              "status" = ?,
              "score" = ?,
              "metrics" = ?,
              "quotaUsageState" = CASE
                WHEN "quotaUsageState" = 'pending' AND ? = 'graded' AND ? IS NOT NULL THEN 'counted'
                WHEN "quotaUsageState" = 'pending' AND ? = 'failed' THEN 'refunded'
                ELSE "quotaUsageState"
              END
            WHERE "id" = ?
            ''',
            (status, score, metrics, status, score, status, submission_id),
        )
        await connection.commit()


async def fail_submission_with_error(submission_id: str, message: str) -> None:
    await update_submission_result(
        submission_id,
        status="failed",
        score=None,
        metrics=json.dumps({"error": message}),
    )


async def fetch_leaderboard_rows(contest_id: str | None) -> list[dict[str, Any]]:
    """Latest graded score per user/contest plus graded submission count for that contest only."""
    query = '''
        SELECT
          s."userId",
          u."name" AS "userName",
          s."contestId",
          c."title" AS "contestTitle",
          s."score" AS "score",
          (
            SELECT COUNT(*)
            FROM "Submission" sc
            WHERE sc."userId" = s."userId"
              AND sc."contestId" = s."contestId"
              AND sc."status" = 'graded'
              AND sc."score" IS NOT NULL
          ) AS "submissionCount"
        FROM "Submission" s
        JOIN "User" u ON u."id" = s."userId"
        JOIN "Contest" c ON c."id" = s."contestId"
        WHERE s."status" = 'graded' AND s."score" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "Submission" newer
            WHERE newer."userId" = s."userId"
              AND newer."contestId" = s."contestId"
              AND newer."status" = 'graded'
              AND newer."score" IS NOT NULL
              AND (
                newer."createdAt" > s."createdAt"
                OR (
                  newer."createdAt" = s."createdAt"
                  AND newer."id" > s."id"
                )
              )
          )
    '''
    params: tuple[Any, ...] = ()
    if contest_id:
        query += ' AND s."contestId" = ?'
        params = (contest_id,)

    query += '''
        ORDER BY s."score" DESC
    '''

    async with open_connection() as connection:
        cursor = await connection.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
