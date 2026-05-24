from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

from backend.worker import format_judge_failure


APP_ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = APP_ROOT / "scripts" / "judge_runner.py"

spec = importlib.util.spec_from_file_location("judge_runner", RUNNER_PATH)
assert spec is not None
judge_runner = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(judge_runner)


class JudgeRunnerPathTests(unittest.TestCase):
    def test_resolves_relative_storage_paths_from_workspace_root(self) -> None:
        path = judge_runner.resolve_workspace_path("storage/submissions/result.pkl")

        self.assertEqual(
            path,
            APP_ROOT.parent.parent / "storage" / "submissions" / "result.pkl",
        )

    def test_preserves_absolute_paths(self) -> None:
        path = Path("/tmp/result.pkl")

        self.assertEqual(judge_runner.resolve_workspace_path(str(path)), path)


class JudgeFailureFormattingTests(unittest.TestCase):
    def test_formats_negative_return_code_as_signal(self) -> None:
        self.assertEqual(
            format_judge_failure(-11, "", ""),
            "Judge terminated by signal 11 (SIGSEGV)",
        )

    def test_includes_stderr_detail(self) -> None:
        self.assertEqual(
            format_judge_failure(-11, "stdout detail", "stderr detail"),
            "Judge terminated by signal 11 (SIGSEGV)\nstderr detail",
        )
