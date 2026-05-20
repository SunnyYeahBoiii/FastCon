from __future__ import annotations

import sqlite3
import tempfile
import unittest
import json
from pathlib import Path

from backend import repositories
from backend import main as api_main


class DummyWorker:
    def notify(self) -> None:
        pass


class FakeApp:
    def __init__(self) -> None:
        self.state = type("State", (), {"worker": DummyWorker()})()


class FakeJsonRequest:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def json(self) -> dict:
        return self._payload


class FakeCompleteRequest:
    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.app = FakeApp()

    async def json(self) -> dict:
        return self._payload


class FakeStreamRequest:
    def __init__(self, chunks: list[bytes], headers: dict[str, str]) -> None:
        self._chunks = chunks
        self.headers = headers
        self.app = FakeApp()

    async def stream(self):
        for chunk in self._chunks:
            yield chunk


class ChunkUploadEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.db_path = self.root / "chunk-upload.db"
        self.submissions_root = self.root / "submissions"

        self.original_runtime_schema_path = repositories._runtime_schema_path
        self.original_get_sqlite_path = repositories.get_sqlite_path
        self.original_get_submissions_root = api_main.get_submissions_root
        repositories._runtime_schema_path = None
        repositories.get_sqlite_path = lambda: self.db_path
        api_main.get_submissions_root = lambda: self.submissions_root

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

                INSERT INTO "User" ("id", "username", "passwordHash", "name", "role")
                VALUES ('u1', 'alice', 'hash', 'Alice', 'contestant');

                INSERT INTO "Contest" ("id", "title", "status", "dailySubmissionLimit")
                VALUES ('c1', 'Task 1', 'ongoing', 3);
                '''
            )
            connection.commit()
        finally:
            connection.close()

    async def asyncTearDown(self) -> None:
        repositories._runtime_schema_path = self.original_runtime_schema_path
        repositories.get_sqlite_path = self.original_get_sqlite_path
        api_main.get_submissions_root = self.original_get_submissions_root
        self.temp_dir.cleanup()

    async def test_chunk_upload_resumes_by_offset_and_queues_submission(self) -> None:
        init_response = await api_main.init_submission_upload(
            FakeJsonRequest(
                {
                    "contestId": "c1",
                    "filename": "answer.pkl",
                    "totalBytes": 6,
                }
            ),
            current_user={"id": "u1"},
        )
        self.assertIsInstance(init_response, dict)
        submission_id = init_response["submissionId"]

        first_chunk = await api_main.upload_submission_file_chunk(
            FakeStreamRequest(
                [b"abc"],
                {"upload-offset": "0", "upload-length": "6"},
            ),
            submission_id,
            current_user={"id": "u1"},
        )
        self.assertEqual(first_chunk.status_code, 200)
        self.assertEqual(first_chunk.headers["Upload-Offset"], "3")
        self.assertFalse(json.loads(first_chunk.body)["complete"])

        offset_response = await api_main.get_submission_upload_offset(
            submission_id,
            current_user={"id": "u1"},
        )
        self.assertEqual(offset_response.status_code, 200)
        self.assertEqual(offset_response.headers["Upload-Offset"], "3")
        self.assertEqual(offset_response.headers["Upload-Length"], "6")

        final_chunk = await api_main.upload_submission_file_chunk(
            FakeStreamRequest(
                [b"def"],
                {"upload-offset": "3", "upload-length": "6"},
            ),
            submission_id,
            current_user={"id": "u1"},
        )
        self.assertEqual(final_chunk.status_code, 200)
        self.assertTrue(json.loads(final_chunk.body)["complete"])
        self.assertEqual(final_chunk.headers["Upload-Offset"], "6")

        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                '''
                SELECT "filepath", "status", "uploadReceivedBytes"
                FROM "Submission"
                WHERE "id" = ?
                ''',
                (submission_id,),
            ).fetchone()
        finally:
            connection.close()

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row[1], "queued")
        self.assertEqual(row[2], 6)
        self.assertEqual(Path(row[0]).read_bytes(), b"abcdef")
        self.assertFalse(Path(f"{row[0]}.part").exists())

    async def test_flow_chunk_helpers_store_duplicate_chunk_idempotently(self) -> None:
        init_response = await api_main.init_submission_upload(
            FakeJsonRequest(
                {
                    "contestId": "c1",
                    "filename": "answer.pkl",
                    "totalBytes": 6,
                }
            ),
            current_user={"id": "u1"},
        )
        self.assertIsInstance(init_response, dict)
        submission_id = init_response["submissionId"]
        pending_upload = await repositories.fetch_pending_submission_upload(
            submission_id,
            user_id="u1",
        )
        assert pending_upload is not None
        filepath = Path(pending_upload["filepath"])

        params = api_main.FlowChunkParams(
            chunk_number=1,
            total_chunks=2,
            chunk_size=3,
            total_size=6,
            identifier="stable-id",
            filename="answer.pkl",
        )

        await api_main._store_flow_chunk(
            FakeStreamRequest([b"abc"], {}),
            filepath,
            params,
        )
        await api_main._store_flow_chunk(
            FakeStreamRequest([b"abc"], {}),
            filepath,
            params,
        )

        part_path = api_main._flow_part_path(filepath, 1)
        self.assertEqual(part_path.read_bytes(), b"abc")
        self.assertEqual(api_main._sum_flow_received_bytes(filepath, params), 3)

    async def test_flow_chunks_upload_out_of_order_and_complete_submission(self) -> None:
        init_response = await api_main.init_submission_upload(
            FakeJsonRequest(
                {
                    "contestId": "c1",
                    "filename": "answer.pkl",
                    "totalBytes": 6,
                }
            ),
            current_user={"id": "u1"},
        )
        self.assertIsInstance(init_response, dict)
        submission_id = init_response["submissionId"]

        second_chunk = await api_main.upload_submission_flow_chunk(
            FakeStreamRequest([b"def"], {}),
            submission_id,
            flow_chunk_number=2,
            flow_total_chunks=2,
            flow_chunk_size=3,
            flow_total_size=6,
            flow_identifier="stable-id",
            flow_filename="answer.pkl",
            current_user={"id": "u1"},
        )
        self.assertEqual(second_chunk.status_code, 200)
        self.assertEqual(json.loads(second_chunk.body)["uploadReceivedBytes"], 3)

        missing_first = await api_main.test_submission_flow_chunk(
            submission_id,
            flow_chunk_number=1,
            flow_total_chunks=2,
            flow_chunk_size=3,
            flow_total_size=6,
            flow_identifier="stable-id",
            flow_filename="answer.pkl",
            current_user={"id": "u1"},
        )
        self.assertEqual(missing_first.status_code, 204)

        first_chunk = await api_main.upload_submission_flow_chunk(
            FakeStreamRequest([b"abc"], {}),
            submission_id,
            flow_chunk_number=1,
            flow_total_chunks=2,
            flow_chunk_size=3,
            flow_total_size=6,
            flow_identifier="stable-id",
            flow_filename="answer.pkl",
            current_user={"id": "u1"},
        )
        self.assertEqual(first_chunk.status_code, 200)
        self.assertEqual(json.loads(first_chunk.body)["uploadReceivedBytes"], 6)

        existing_first = await api_main.test_submission_flow_chunk(
            submission_id,
            flow_chunk_number=1,
            flow_total_chunks=2,
            flow_chunk_size=3,
            flow_total_size=6,
            flow_identifier="stable-id",
            flow_filename="answer.pkl",
            current_user={"id": "u1"},
        )
        self.assertEqual(existing_first.status_code, 200)

        complete = await api_main.complete_submission_flow_upload(
            FakeCompleteRequest(
                {
                    "flowTotalChunks": 2,
                    "flowChunkSize": 3,
                    "flowTotalSize": 6,
                    "flowIdentifier": "stable-id",
                    "flowFilename": "answer.pkl",
                }
            ),
            submission_id,
            current_user={"id": "u1"},
        )
        self.assertEqual(complete.status_code, 200)
        self.assertTrue(json.loads(complete.body)["complete"])

        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                '''
                SELECT "filepath", "status", "uploadReceivedBytes"
                FROM "Submission"
                WHERE "id" = ?
                ''',
                (submission_id,),
            ).fetchone()
        finally:
            connection.close()

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row[1], "queued")
        self.assertEqual(row[2], 6)
        self.assertEqual(Path(row[0]).read_bytes(), b"abcdef")
        self.assertFalse(Path(f"{row[0]}.parts").exists())

    async def test_flow_complete_rejects_missing_part(self) -> None:
        init_response = await api_main.init_submission_upload(
            FakeJsonRequest(
                {
                    "contestId": "c1",
                    "filename": "answer.pkl",
                    "totalBytes": 6,
                }
            ),
            current_user={"id": "u1"},
        )
        self.assertIsInstance(init_response, dict)
        submission_id = init_response["submissionId"]

        await api_main.upload_submission_flow_chunk(
            FakeStreamRequest([b"abc"], {}),
            submission_id,
            flow_chunk_number=1,
            flow_total_chunks=2,
            flow_chunk_size=3,
            flow_total_size=6,
            flow_identifier="stable-id",
            flow_filename="answer.pkl",
            current_user={"id": "u1"},
        )

        complete = await api_main.complete_submission_flow_upload(
            FakeCompleteRequest(
                {
                    "flowTotalChunks": 2,
                    "flowChunkSize": 3,
                    "flowTotalSize": 6,
                    "flowIdentifier": "stable-id",
                    "flowFilename": "answer.pkl",
                }
            ),
            submission_id,
            current_user={"id": "u1"},
        )

        self.assertEqual(complete.status_code, 409)
        self.assertEqual(json.loads(complete.body)["code"], "FLOW_CHUNKS_INCOMPLETE")

    async def test_flow_chunk_test_route_accepts_get_for_flowjs_query_params(self) -> None:
        matching_routes = [
            route
            for route in api_main.app.routes
            if getattr(route, "path", "") == "/api/submissions/{submission_id}/flow-chunks"
        ]
        route_methods = set().union(
            *(getattr(route, "methods", set()) for route in matching_routes)
        )

        self.assertIn("GET", route_methods)
        self.assertIn("HEAD", route_methods)


if __name__ == "__main__":
    unittest.main()
