from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend import repositories
from backend.schemas import build_leaderboard, get_points_from_rank


class BuildLeaderboardTests(unittest.TestCase):
    def test_keeps_best_score_per_user_per_contest(self) -> None:
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
                  "score" REAL
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

    async def test_counts_only_graded_submissions(self) -> None:
        connection = sqlite3.connect(self.db_path)
        try:
            connection.executemany(
                '''
                INSERT INTO "Submission" (
                  "id",
                  "userId",
                  "contestId",
                  "status",
                  "score"
                )
                VALUES (?, ?, ?, ?, ?)
                ''',
                [
                    ("s1", "u1", "c1", "graded", 90.0),
                    ("s2", "u1", "c1", "failed", None),
                    ("s3", "u1", "c1", "graded", 95.0),
                ],
            )
            connection.commit()
        finally:
            connection.close()

        rows = await repositories.fetch_leaderboard_rows("c1")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["score"], 95.0)
        self.assertEqual(rows[0]["submissionCount"], 2)


if __name__ == "__main__":
    unittest.main()
