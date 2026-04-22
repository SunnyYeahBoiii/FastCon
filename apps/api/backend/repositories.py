from __future__ import annotations

import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator

import aiosqlite

from .config import get_sqlite_path

QUOTA_WINDOW_DURATION = timedelta(hours=24)


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
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise TypeError(f"Unsupported datetime value: {value!r}")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _build_quota_snapshot(
    *,
    contest_id: str,
    daily_submission_limit: Any,
    window_started_at: Any,
    submission_count: Any,
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = now or _utc_now()
    limit = _normalize_submission_limit(daily_submission_limit)
    if limit is None:
        return {
            "contestId": contest_id,
            "dailySubmissionLimit": None,
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
        "used": used,
        "remaining": remaining,
        "windowStartedAt": started_at,
        "resetAt": reset_at,
        "isLimited": True,
        "isQuotaExceeded": used >= limit,
    }


@asynccontextmanager
async def open_connection() -> AsyncIterator[aiosqlite.Connection]:
    connection = await aiosqlite.connect(get_sqlite_path(), timeout=30)
    connection.row_factory = aiosqlite.Row
    try:
        yield connection
    finally:
        await connection.close()


async def ensure_submission_quota_schema(connection: aiosqlite.Connection) -> None:
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

    async with open_connection() as connection:
        await ensure_submission_quota_schema(connection)
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

    return _build_quota_snapshot(
        contest_id=contest_id,
        daily_submission_limit=contest["dailySubmissionLimit"],
        window_started_at=quota_row["windowStartedAt"] if quota_row else None,
        submission_count=quota_row["submissionCount"] if quota_row else 0,
    )


async def create_submission_with_quota(
    *,
    user_id: str,
    contest_id: str,
    filename: str,
    filepath: str,
) -> dict[str, Any]:
    submission_id = _submission_id()
    now = _utc_now()
    now_iso = now.isoformat()

    async with open_connection() as connection:
        await ensure_submission_quota_schema(connection)
        await connection.execute("BEGIN IMMEDIATE")

        contest_cursor = await connection.execute(
            'SELECT "id", "dailySubmissionLimit" FROM "Contest" WHERE "id" = ?',
            (contest_id,),
        )
        contest = _row_to_dict(await contest_cursor.fetchone())
        if contest is None:
            await connection.rollback()
            return {"ok": False, "reason": "contest_not_found"}

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

            current_quota = _build_quota_snapshot(
                contest_id=contest_id,
                daily_submission_limit=limit,
                window_started_at=quota_row["windowStartedAt"] if quota_row else None,
                submission_count=quota_row["submissionCount"] if quota_row else 0,
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
                    window_started_at=now,
                    submission_count=1,
                    now=now,
                )
            else:
                new_submission_count = int(quota_row["submissionCount"]) + 1
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
                    window_started_at=quota_row["windowStartedAt"],
                    submission_count=new_submission_count,
                    now=now,
                )
        else:
            quota_snapshot = _build_quota_snapshot(
                contest_id=contest_id,
                daily_submission_limit=None,
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
              "status"
            )
            VALUES (?, ?, ?, ?, ?, 'queued')
            ''',
            (submission_id, user_id, contest_id, filename, filepath),
        )
        await connection.commit()
    return {"ok": True, "submissionId": submission_id, "quota": quota_snapshot}


async def reset_running_submissions() -> None:
    async with open_connection() as connection:
        await connection.execute(
            'UPDATE "Submission" SET "status" = \'queued\' WHERE "status" = \'running\''
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
    async with open_connection() as connection:
        await connection.execute(
            '''
            UPDATE "Submission"
            SET "status" = ?, "score" = ?, "metrics" = ?
            WHERE "id" = ?
            ''',
            (status, score, metrics, submission_id),
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
    query = '''
        SELECT
          s."userId",
          u."name" AS "userName",
          s."contestId",
          c."title" AS "contestTitle",
          s."score",
          s."createdAt"
        FROM "Submission" s
        JOIN "User" u ON u."id" = s."userId"
        JOIN "Contest" c ON c."id" = s."contestId"
        WHERE s."status" = 'graded' AND s."score" IS NOT NULL
    '''
    params: tuple[Any, ...] = ()
    if contest_id:
        query += ' AND s."contestId" = ?'
        params = (contest_id,)

    query += ' ORDER BY s."createdAt" DESC'

    async with open_connection() as connection:
        cursor = await connection.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
