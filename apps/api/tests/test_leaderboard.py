from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend import repositories
from backend.schemas import build_leaderboard, get_points_from_rank


class BuildLeaderboardTests(unittest.TestCase):
    def test_preserves_repository_score_per_user_per_contest(self) -> None:
        rows = [
            {
                "userId": "u1",
                "userName": "Alice",
                "contestId": "c1",
                "contestTitle": "Task 1",
                "score": 95.0,
                "submissionCount": 2,
            },
        ]

        leaderboard = build_leaderboard(rows)

        self.assertEqual(len(leaderboard), 1)
        self.assertEqual(leaderboard[0]["score"], 95.0)
        self.assertEqual(leaderboard[0]["submissionCount"], 2)

    def test_does_not_merge_scores_or_counts_across_contests(self) -> None:
        rows = [
            {
                "userId": "u1",
                "userName": "Alice",
                "contestId": "c1",
                "contestTitle": "Task 1",
                "score": 40.0,
                "submissionCount": 2,
            },
            {
                "userId": "u1",
                "userName": "Alice",
                "contestId": "c2",
                "contestTitle": "Task 2",
                "score": 90.0,
                "submissionCount": 5,
            },
        ]

        leaderboard = build_leaderboard(rows)

        self.assertEqual(len(leaderboard), 2)
        by_contest = {entry["contestId"]: entry for entry in leaderboard}
        self.assertEqual(by_contest["c1"]["score"], 40.0)
        self.assertEqual(by_contest["c1"]["submissionCount"], 2)
        self.assertEqual(by_contest["c2"]["score"], 90.0)
        self.assertEqual(by_contest["c2"]["submissionCount"], 5)

    def test_assigns_record_points_by_score_rank(self) -> None:
        rows = [
            {
                "userId": "u1",
                "userName": "Alice",
                "contestId": "c1",
                "contestTitle": "Task 1",
                "score": 50.0,
            },
            {
                "userId": "u2",
                "userName": "Bob",
                "contestId": "c1",
                "contestTitle": "Task 1",
                "score": 80.0,
            },
        ]

        leaderboard = build_leaderboard(rows)

        self.assertEqual(leaderboard[0]["userId"], "u2")
        self.assertEqual(leaderboard[0]["rank"], 1)
        self.assertEqual(leaderboard[0]["recordPoints"], get_points_from_rank(1))
        self.assertEqual(leaderboard[1]["userId"], "u1")
        self.assertEqual(leaderboard[1]["recordPoints"], get_points_from_rank(2))

    def test_record_points_decrease_one_point_per_rank_until_zero(self) -> None:
        record_points = [get_points_from_rank(rank) for rank in range(0, 13)]

        self.assertEqual(record_points, [0, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0])


class FetchLeaderboardRowsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "leaderboard.db"
        self.original_get_sqlite_path = repositories.get_sqlite_path
        repositories.get_sqlite_path = lambda: self.db_path

        connection = sqlite3.connect(self.db_path)
        try:
            connection.executescript(
                '''
                CREATE TABLE "User" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "name" TEXT NOT NULL
                );

                CREATE TABLE "Contest" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "title" TEXT NOT NULL
                );

                CREATE TABLE "Submission" (
                  "id" TEXT NOT NULL PRIMARY KEY,
                  "userId" TEXT NOT NULL,
                  "contestId" TEXT NOT NULL,
                  "status" TEXT NOT NULL,
                  "score" REAL,
                  "createdAt" TEXT NOT NULL
                );
                '''
            )
            connection.execute(
                'INSERT INTO "User" ("id", "name") VALUES (?, ?)',
                ("u1", "Alice"),
            )
            connection.execute(
                'INSERT INTO "Contest" ("id", "title") VALUES (?, ?)',
                ("c1", "Task 1"),
            )
            connection.commit()
        finally:
            connection.close()

    async def asyncTearDown(self) -> None:
        repositories.get_sqlite_path = self.original_get_sqlite_path
        self.temp_dir.cleanup()

    async def test_uses_latest_graded_submission_score(self) -> None:
        connection = sqlite3.connect(self.db_path)
        try:
            connection.executemany(
                '''
                INSERT INTO "Submission" (
                  "id",
                  "userId",
                  "contestId",
                  "status",
                  "score",
                  "createdAt"
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ''',
                [
                    ("s1", "u1", "c1", "graded", 95.0, "2026-01-01T00:00:00+00:00"),
                    ("s2", "u1", "c1", "graded", 80.0, "2026-01-02T00:00:00+00:00"),
                ],
            )
            connection.commit()
        finally:
            connection.close()

        rows = await repositories.fetch_leaderboard_rows("c1")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["score"], 80.0)
        self.assertEqual(rows[0]["submissionCount"], 2)

    async def test_ignores_newer_failed_submission_for_latest_score(self) -> None:
        connection = sqlite3.connect(self.db_path)
        try:
            connection.executemany(
                '''
                INSERT INTO "Submission" (
                  "id",
                  "userId",
                  "contestId",
                  "status",
                  "score",
                  "createdAt"
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ''',
                [
                    ("s1", "u1", "c1", "graded", 90.0, "2026-01-01T00:00:00+00:00"),
                    ("s2", "u1", "c1", "failed", None, "2026-01-02T00:00:00+00:00"),
                ],
            )
            connection.commit()
        finally:
            connection.close()

        rows = await repositories.fetch_leaderboard_rows("c1")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["score"], 90.0)
        self.assertEqual(rows[0]["submissionCount"], 1)


if __name__ == "__main__":
    unittest.main()
