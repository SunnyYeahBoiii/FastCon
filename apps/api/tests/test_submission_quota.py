from __future__ import annotations

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
