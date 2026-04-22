from __future__ import annotations

import json
import secrets
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import aiosqlite

from .config import get_sqlite_path


def _submission_id() -> str:
    return f"c{secrets.token_hex(12)}"


def _row_to_dict(row: aiosqlite.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


@asynccontextmanager
async def open_connection() -> AsyncIterator[aiosqlite.Connection]:
    connection = await aiosqlite.connect(get_sqlite_path(), timeout=30)
    connection.row_factory = aiosqlite.Row
    try:
        yield connection
    finally:
        await connection.close()


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
            'SELECT "id", "title" FROM "Contest" WHERE "id" = ?',
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


async def create_submission(
    *,
    user_id: str,
    contest_id: str,
    filename: str,
    filepath: str,
) -> str:
    submission_id = _submission_id()
    async with open_connection() as connection:
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
    return submission_id


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
