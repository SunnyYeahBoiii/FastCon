from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
