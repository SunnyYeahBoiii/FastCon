from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

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


if __name__ == "__main__":
    unittest.main()
