from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.main import _stream_request_to_file


class FakeRequest:
    def __init__(self, chunks: list[bytes | Exception]) -> None:
        self._chunks = chunks

    async def stream(self):
        for chunk in self._chunks:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk


class UploadStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_request_writes_to_part_file_then_renames(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            filepath = Path(temp_dir) / "submission.pkl"

            bytes_written = await _stream_request_to_file(
                FakeRequest([b"abc", b"", b"def"]),
                filepath,
            )

            self.assertEqual(bytes_written, 6)
            self.assertEqual(filepath.read_bytes(), b"abcdef")
            self.assertFalse(filepath.with_name("submission.pkl.part").exists())

    async def test_stream_request_removes_partial_file_on_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            filepath = Path(temp_dir) / "submission.pkl"

            with self.assertRaises(RuntimeError):
                await _stream_request_to_file(
                    FakeRequest([b"abc", RuntimeError("disconnect")]),
                    filepath,
                )

            self.assertFalse(filepath.exists())
            self.assertFalse(filepath.with_name("submission.pkl.part").exists())


if __name__ == "__main__":
    unittest.main()
