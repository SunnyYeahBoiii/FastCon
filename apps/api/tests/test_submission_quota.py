from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend import repositories
from backend.repositories import _build_quota_snapshot, _coerce_datetime


class CoerceDatetimeTests(unittest.TestCase):
    def test_coerces_prisma_sqlite_millisecond_timestamp(self) -> None:
        parsed = _coerce_datetime(1782395520000)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.year, 2026)
        self.assertEqual(parsed.tzinfo, timezone.utc)

    def test_coerces_iso_string(self) -> None:
        parsed = _coerce_datetime("2026-05-18T12:00:00.000Z")
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.hour, 12)

    def test_builds_quota_snapshot_with_millisecond_deadline(self) -> None:
        now = datetime(2026, 3, 11, 13, 0, tzinfo=timezone.utc)
        snapshot = _build_quota_snapshot(
            contest_id="contest-1",
            daily_submission_limit=5,
            contest_deadline=1782395520000,
            window_started_at=None,
            submission_count=0,
            now=now,
        )
        self.assertFalse(snapshot["isDeadlinePassed"])


class SubmissionQuotaSnapshotTests(unittest.TestCase):
    def test_unlimited_quota_has_no_window_or_reset(self) -> None:
        now = datetime(2026, 3, 11, 13, 0, tzinfo=timezone.utc)

        snapshot = _build_quota_snapshot(
            contest_id="contest-1",
            daily_submission_limit=None,
            contest_deadline=None,
            window_started_at=None,
            submission_count=0,
            now=now,
        )

        self.assertFalse(snapshot["isLimited"])
        self.assertEqual(snapshot["used"], 0)
        self.assertIsNone(snapshot["remaining"])
        self.assertIsNone(snapshot["windowStartedAt"])
        self.assertIsNone(snapshot["resetAt"])

    def test_active_window_keeps_remaining_until_reset(self) -> None:
        now = datetime(2026, 3, 11, 14, 0, tzinfo=timezone.utc)
        started_at = datetime(2026, 3, 11, 13, 0, tzinfo=timezone.utc)

        snapshot = _build_quota_snapshot(
            contest_id="contest-1",
            daily_submission_limit=5,
            contest_deadline=None,
            window_started_at=started_at,
            submission_count=3,
            now=now,
        )

        self.assertTrue(snapshot["isLimited"])
        self.assertEqual(snapshot["used"], 3)
        self.assertEqual(snapshot["remaining"], 2)
        self.assertEqual(snapshot["windowStartedAt"], started_at)
        self.assertEqual(snapshot["resetAt"], started_at + timedelta(hours=24))
        self.assertFalse(snapshot["isQuotaExceeded"])

    def test_window_resets_exactly_at_twenty_four_hours(self) -> None:
        started_at = datetime(2026, 3, 11, 13, 0, tzinfo=timezone.utc)
        now = started_at + timedelta(hours=24)

        snapshot = _build_quota_snapshot(
            contest_id="contest-1",
            daily_submission_limit=5,
            contest_deadline=None,
            window_started_at=started_at,
            submission_count=5,
            now=now,
        )

        self.assertTrue(snapshot["isLimited"])
        self.assertEqual(snapshot["used"], 0)
        self.assertEqual(snapshot["remaining"], 5)
        self.assertIsNone(snapshot["windowStartedAt"])
        self.assertIsNone(snapshot["resetAt"])
        self.assertFalse(snapshot["isQuotaExceeded"])


class SubmissionQuotaRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "quota.db"
        self.original_runtime_schema_path = repositories._runtime_schema_path
        self.original_get_sqlite_path = repositories.get_sqlite_path
        repositories._runtime_schema_path = None
        repositories.get_sqlite_path = lambda: self.db_path

        connection = sqlite3.connect(self.db_path)
        try:
            connection.executescript(
                '''
                CREATE TABLE "User" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "username" TEXT NOT NULL,
                  "passwordHash" TEXT NOT NULL,
                  "name" TEXT NOT NULL,
                  "role" TEXT NOT NULL DEFAULT 'contestant',
                  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE "Contest" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "title" TEXT NOT NULL,
                  "description" TEXT,
                  "groundTruthPath" TEXT,
                  "evaluateCode" TEXT,
                  "deadline" DATETIME,
                  "status" TEXT NOT NULL DEFAULT 'ongoing',
                  "dailySubmissionLimit" INTEGER,
                  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE "Submission" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "userId" TEXT NOT NULL,
                  "contestId" TEXT NOT NULL,
                  "filename" TEXT NOT NULL,
                  "filepath" TEXT NOT NULL,
                  "status" TEXT NOT NULL DEFAULT 'uploaded',
                  "score" REAL,
                  "metrics" TEXT,
                  "quotaUsageState" TEXT NOT NULL DEFAULT 'pending',
                  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE "SubmissionQuotaWindow" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "userId" TEXT NOT NULL,
                  "contestId" TEXT NOT NULL,
                  "windowStartedAt" DATETIME NOT NULL,
                  "submissionCount" INTEGER NOT NULL DEFAULT 0,
                  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE UNIQUE INDEX "SubmissionQuotaWindow_userId_contestId_key"
                ON "SubmissionQuotaWindow" ("userId", "contestId");
                '''
            )
            connection.execute(
                '''
                INSERT INTO "User" ("id", "username", "passwordHash", "name", "role")
                VALUES ('u1', 'alice', 'hash', 'Alice', 'contestant')
                '''
            )
            connection.execute(
                '''
                INSERT INTO "Contest" ("id", "title", "status", "dailySubmissionLimit")
                VALUES ('c1', 'Task 1', 'ongoing', 3)
                '''
            )
            connection.commit()
        finally:
            connection.close()

    async def asyncTearDown(self) -> None:
        repositories._runtime_schema_path = self.original_runtime_schema_path
        repositories.get_sqlite_path = self.original_get_sqlite_path
        self.temp_dir.cleanup()

    def _insert_quota_window(self, *, count: int = 99) -> datetime:
        started_at = datetime.now(timezone.utc) - timedelta(hours=1)
        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                '''
                INSERT INTO "SubmissionQuotaWindow" (
                  "id",
                  "userId",
                  "contestId",
                  "windowStartedAt",
                  "submissionCount"
                )
                VALUES ('q1', 'u1', 'c1', ?, ?)
                ''',
                (started_at.isoformat(), count),
            )
            connection.commit()
        finally:
            connection.close()
        return started_at

    def _insert_submission(
        self,
        submission_id: str,
        *,
        status: str,
        quota_usage_state: str,
        created_at: datetime,
        score: float | None = None,
    ) -> None:
        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                '''
                INSERT INTO "Submission" (
                  "id",
                  "userId",
                  "contestId",
                  "filename",
                  "filepath",
                  "status",
                  "score",
                  "quotaUsageState",
                  "createdAt"
                )
                VALUES (?, 'u1', 'c1', ?, ?, ?, ?, ?, ?)
                ''',
                (
                    submission_id,
                    f"{submission_id}.pkl",
                    f"/tmp/{submission_id}.pkl",
                    status,
                    score,
                    quota_usage_state,
                    created_at.isoformat(),
                ),
            )
            connection.commit()
        finally:
            connection.close()

    def _quota_usage_state(self, submission_id: str) -> str:
        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                'SELECT "quotaUsageState" FROM "Submission" WHERE "id" = ?',
                (submission_id,),
            ).fetchone()
        finally:
            connection.close()
        assert row is not None
        return str(row[0])

    async def test_quota_used_is_derived_from_active_pending_and_counted_submissions(self) -> None:
        started_at = self._insert_quota_window()
        self._insert_submission(
            "s-pending",
            status="queued",
            quota_usage_state="pending",
            created_at=started_at + timedelta(minutes=1),
        )
        self._insert_submission(
            "s-counted",
            status="graded",
            quota_usage_state="counted",
            created_at=started_at + timedelta(minutes=2),
            score=90.0,
        )
        self._insert_submission(
            "s-refunded",
            status="failed",
            quota_usage_state="refunded",
            created_at=started_at + timedelta(minutes=3),
        )
        self._insert_submission(
            "s-before-window",
            status="graded",
            quota_usage_state="counted",
            created_at=started_at - timedelta(minutes=1),
            score=50.0,
        )

        quota = await repositories.fetch_submission_quota("u1", "c1")

        assert quota is not None
        self.assertEqual(quota["used"], 2)
        self.assertEqual(quota["remaining"], 1)

    async def test_first_judge_result_settles_pending_quota_usage_once(self) -> None:
        now = datetime(2026, 5, 18, 2, 0, tzinfo=timezone.utc)
        self._insert_submission(
            "s-failed",
            status="running",
            quota_usage_state="pending",
            created_at=now,
        )
        self._insert_submission(
            "s-graded",
            status="running",
            quota_usage_state="pending",
            created_at=now,
        )

        await repositories.update_submission_result(
            "s-failed",
            status="failed",
            score=None,
            metrics="{}",
        )
        await repositories.requeue_submission("s-failed")
        await repositories.update_submission_result(
            "s-failed",
            status="graded",
            score=88.0,
            metrics="{}",
        )

        await repositories.update_submission_result(
            "s-graded",
            status="graded",
            score=90.0,
            metrics="{}",
        )
        await repositories.requeue_submission("s-graded")
        await repositories.update_submission_result(
            "s-graded",
            status="failed",
            score=None,
            metrics="{}",
        )

        self.assertEqual(self._quota_usage_state("s-failed"), "refunded")
        self.assertEqual(self._quota_usage_state("s-graded"), "counted")

    async def test_create_submission_with_quota_ignores_refunded_submissions(self) -> None:
        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                'UPDATE "Contest" SET "dailySubmissionLimit" = 2 WHERE "id" = ?',
                ("c1",),
            )
            connection.commit()
        finally:
            connection.close()

        started_at = self._insert_quota_window(count=2)
        self._insert_submission(
            "s-pending",
            status="queued",
            quota_usage_state="pending",
            created_at=started_at + timedelta(minutes=1),
        )
        self._insert_submission(
            "s-refunded",
            status="failed",
            quota_usage_state="refunded",
            created_at=started_at + timedelta(minutes=2),
        )

        result = await repositories.create_submission_with_quota(
            user_id="u1",
            contest_id="c1",
            filename="new.pkl",
            filepath="/tmp/new.pkl",
        )
        next_result = await repositories.create_submission_with_quota(
            user_id="u1",
            contest_id="c1",
            filename="blocked.pkl",
            filepath="/tmp/blocked.pkl",
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["quota"]["used"], 2)
        self.assertEqual(result["quota"]["remaining"], 0)
        self.assertFalse(next_result["ok"])
        self.assertEqual(next_result["reason"], "submission_limit_reached")

    async def test_prepare_upload_reserves_quota_until_upload_completes(self) -> None:
        result = await repositories.prepare_submission_upload_with_quota(
            user_id="u1",
            contest_id="c1",
            filename="large.pkl",
            filepath="/tmp/large.pkl",
            upload_total_bytes=12,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["quota"]["used"], 1)
        self.assertEqual(result["quota"]["remaining"], 2)

        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                '''
                SELECT "status", "quotaUsageState", "uploadTotalBytes", "uploadReceivedBytes"
                FROM "Submission"
                WHERE "id" = ?
                ''',
                (result["submissionId"],),
            ).fetchone()
        finally:
            connection.close()

        self.assertEqual(row, ("uploading", "pending", 12, 0))

        progressed = await repositories.update_submission_upload_progress(
            result["submissionId"],
            user_id="u1",
            received_bytes=7,
        )
        self.assertTrue(progressed)

        pending_upload = await repositories.fetch_pending_submission_upload(
            result["submissionId"],
            user_id="u1",
        )
        assert pending_upload is not None
        self.assertEqual(pending_upload["uploadTotalBytes"], 12)
        self.assertEqual(pending_upload["uploadReceivedBytes"], 7)

        completed = await repositories.complete_submission_upload(
            result["submissionId"],
            user_id="u1",
        )

        self.assertTrue(completed)

        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                'SELECT "status", "quotaUsageState" FROM "Submission" WHERE "id" = ?',
                (result["submissionId"],),
            ).fetchone()
        finally:
            connection.close()

        self.assertEqual(row, ("queued", "pending"))

    async def test_failed_upload_refunds_reserved_quota(self) -> None:
        result = await repositories.prepare_submission_upload_with_quota(
            user_id="u1",
            contest_id="c1",
            filename="large.pkl",
            filepath="/tmp/large.pkl",
        )
        self.assertTrue(result["ok"])

        failed = await repositories.fail_submission_upload(
            result["submissionId"],
            user_id="u1",
            message="client disconnected",
        )
        quota = await repositories.fetch_submission_quota("u1", "c1")

        self.assertTrue(failed)
        assert quota is not None
        self.assertEqual(quota["used"], 0)
        self.assertEqual(quota["remaining"], 3)
        self.assertEqual(self._quota_usage_state(result["submissionId"]), "refunded")

    async def test_stale_uploads_fail_and_refund_reserved_quota(self) -> None:
        stale_created_at = datetime(2026, 5, 18, 1, 0, tzinfo=timezone.utc)
        fresh_created_at = datetime(2026, 5, 18, 1, 10, tzinfo=timezone.utc)
        self._insert_submission(
            "s-stale-upload",
            status="uploading",
            quota_usage_state="pending",
            created_at=stale_created_at,
        )
        self._insert_submission(
            "s-fresh-upload",
            status="uploading",
            quota_usage_state="pending",
            created_at=fresh_created_at,
        )

        failed_uploads = await repositories.fail_stale_submission_uploads(
            older_than=datetime(2026, 5, 18, 1, 5, tzinfo=timezone.utc),
            message="Upload did not finish before timeout",
        )

        self.assertEqual([row["id"] for row in failed_uploads], ["s-stale-upload"])

        connection = sqlite3.connect(self.db_path)
        try:
            rows = connection.execute(
                '''
                SELECT "id", "status", "metrics", "quotaUsageState"
                FROM "Submission"
                WHERE "id" IN ('s-stale-upload', 's-fresh-upload')
                ORDER BY "id"
                '''
            ).fetchall()
        finally:
            connection.close()

        self.assertEqual(rows[0][0], "s-fresh-upload")
        self.assertEqual(rows[0][1], "uploading")
        self.assertEqual(rows[0][3], "pending")
        self.assertEqual(rows[1][0], "s-stale-upload")
        self.assertEqual(rows[1][1], "failed")
        self.assertEqual(json.loads(rows[1][2]), {"error": "Upload did not finish before timeout"})
        self.assertEqual(rows[1][3], "refunded")


class RuntimeSchemaEnsureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.original_runtime_schema_path = repositories._runtime_schema_path
        self.original_get_sqlite_path = repositories.get_sqlite_path
        self.original_open_connection = repositories.open_connection
        self.original_ensure_submission_quota_schema = repositories.ensure_submission_quota_schema
        repositories._runtime_schema_path = None

    async def asyncTearDown(self) -> None:
        repositories._runtime_schema_path = self.original_runtime_schema_path
        repositories.get_sqlite_path = self.original_get_sqlite_path
        repositories.open_connection = self.original_open_connection
        repositories.ensure_submission_quota_schema = self.original_ensure_submission_quota_schema

    async def test_runtime_schema_is_cached_per_sqlite_database(self) -> None:
        calls = 0

        @asynccontextmanager
        async def fake_open_connection():
            yield object()

        async def fake_ensure_submission_quota_schema(_connection: object) -> None:
            nonlocal calls
            calls += 1

        repositories.open_connection = fake_open_connection
        repositories.ensure_submission_quota_schema = fake_ensure_submission_quota_schema
        repositories.get_sqlite_path = lambda: Path("/tmp/fast-con-a.db")

        await repositories.ensure_runtime_schema()
        await repositories.ensure_runtime_schema()

        self.assertEqual(calls, 1)

        repositories.get_sqlite_path = lambda: Path("/tmp/fast-con-b.db")
        await repositories.ensure_runtime_schema()

        self.assertEqual(calls, 2)


if __name__ == "__main__":
    unittest.main()
