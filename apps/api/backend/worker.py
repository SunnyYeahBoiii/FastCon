from __future__ import annotations

import asyncio
import aiosqlite
import os
import shutil
import signal
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import repositories, schemas
from .config import (
    APP_ROOT,
    calculate_judge_timeout,
    get_judge_timeout_seconds,
    get_pending_upload_timeout_seconds,
    get_python_bin,
    get_sqlite_path,
    get_worker_max_concurrent,
    get_worker_poll_ms,
)
from .streams import SubmissionBroadcaster


class SubmissionWorker:
    def __init__(self, broadcaster: SubmissionBroadcaster) -> None:
        self._broadcaster = broadcaster
        self._loop_task: asyncio.Task[None] | None = None
        self._active: dict[str, asyncio.Task[None]] = {}
        self._stop_event = asyncio.Event()
        self._wakeup_event = asyncio.Event()

    async def start(self) -> None:
        await repositories.reset_running_submissions()
        print("[worker] WAL mode active; starting submission processing loop")
        self._stop_event.clear()
        self._wakeup_event.set()
        self._loop_task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        self._wakeup_event.set()

        if self._loop_task is not None:
            self._loop_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._loop_task
            self._loop_task = None

        active_tasks = list(self._active.values())
        for task in active_tasks:
            task.cancel()
        for task in active_tasks:
            with suppress(asyncio.CancelledError):
                await task
        self._active.clear()

    def notify(self) -> None:
        self._wakeup_event.set()

    async def _run_loop(self) -> None:
        poll_seconds = get_worker_poll_ms() / 1000
        pending_upload_timeout_seconds = get_pending_upload_timeout_seconds()
        stale_check_interval = min(60, max(poll_seconds, pending_upload_timeout_seconds / 10))
        # Stale running jobs: double the judge timeout as safety margin
        running_timeout_seconds = get_judge_timeout_seconds() * 2
        next_stale_check = 0.0
        try:
            while not self._stop_event.is_set():
                now = asyncio.get_running_loop().time()
                if now >= next_stale_check:
                    await self._fail_stale_uploads(pending_upload_timeout_seconds)
                    await self._fail_stale_running_jobs(running_timeout_seconds)
                    next_stale_check = now + stale_check_interval
                await self._fill_available_slots()
                self._wakeup_event.clear()
                try:
                    await asyncio.wait_for(self._wakeup_event.wait(), timeout=poll_seconds)
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            raise

    async def _fill_available_slots(self) -> None:
        max_concurrent = get_worker_max_concurrent()
        while not self._stop_event.is_set() and len(self._active) < max_concurrent:
            job = await repositories.claim_next_queued_submission()
            if job is None:
                return

            task = asyncio.create_task(self._process_job(job))
            self._active[job["id"]] = task
            task.add_done_callback(lambda _task, submission_id=job["id"]: self._active.pop(submission_id, None))

    async def _fail_stale_uploads(self, timeout_seconds: int) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)
        failed_uploads = await repositories.fail_stale_submission_uploads(
            older_than=cutoff,
            message="Upload did not finish before timeout",
        )
        for upload in failed_uploads:
            filepath = Path(upload["filepath"])
            await asyncio.to_thread(filepath.unlink, missing_ok=True)
            await asyncio.to_thread(filepath.with_name(f"{filepath.name}.part").unlink, missing_ok=True)
            await asyncio.to_thread(
                shutil.rmtree,
                filepath.with_name(f"{filepath.name}.parts"),
                True,
            )
            await self._broadcaster.publish(
                upload["userId"],
                schemas.submission_update_payload(upload, upload["id"], "failed"),
            )

    async def _fail_stale_running_jobs(self, timeout_seconds: int) -> None:
        """Fail submissions that have been running too long (orphaned processes)."""
        import json

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)
        error_message = "Judge process became unresponsive"
        metrics = json.dumps({"error": error_message})

        async with aiosqlite.connect(str(get_sqlite_path())) as conn:
            conn.row_factory = aiosqlite.Row
            # Begin immediate transaction for atomicity
            await conn.execute("BEGIN IMMEDIATE")
            cursor = await conn.execute(
                '''
                SELECT "id", "userId"
                FROM "Submission"
                WHERE "status" = 'running'
                  AND datetime("updatedAt") < datetime(?)
                ''',
                (cutoff.isoformat(),),
            )
            rows = [dict(row) for row in await cursor.fetchall()]
            if not rows:
                await conn.commit()
                return

            await conn.execute(
                '''
                UPDATE "Submission"
                SET
                  "status" = 'failed',
                  "metrics" = ?,
                  "quotaUsageState" = 'refunded'
                WHERE "status" = 'running'
                  AND datetime("updatedAt") < datetime(?)
                ''',
                (metrics, cutoff.isoformat()),
            )
            await conn.commit()

        for row in rows:
            final_row = {**row, "status": "failed", "metrics": metrics}
            await self._broadcaster.publish(
                row["userId"],
                schemas.submission_update_payload(final_row, row["id"], "failed"),
            )

    async def _process_job(self, job: dict) -> None:
        submission_id = job["id"]
        user_id = job["userId"]

        await self._broadcaster.publish(
            user_id,
            {
                "type": "status_change",
                "submissionId": submission_id,
                "status": "running",
            },
        )

        try:
            await self._run_judge(submission_id, user_id)
        finally:
            self.notify()

    async def _run_judge(self, submission_id: str, user_id: str) -> None:
        # Get file size for dynamic timeout
        filepath = await self._get_submission_filepath(submission_id)
        if filepath is None:
            await repositories.fail_submission_with_error(
                submission_id,
                "Could not find submission filepath",
            )
            return

        try:
            file_stat = await asyncio.to_thread(filepath.stat)
            file_size_bytes = file_stat.st_size
        except FileNotFoundError:
            await repositories.fail_submission_with_error(
                submission_id,
                "Submission file not found",
            )
            return

        timeout_seconds = calculate_judge_timeout(file_size_bytes)

        script_path = Path(APP_ROOT) / "scripts" / "judge_runner.py"
        env = os.environ.copy()
        env["PYTHONFAULTHANDLER"] = "1"
        process = await asyncio.create_subprocess_exec(
            get_python_bin(),
            str(script_path),
            submission_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(APP_ROOT),
            env=env,
            start_new_session=True,  # Creates new process group for clean termination
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError:
            # Kill entire process group
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except (ProcessLookupError, OSError):
                process.kill()
            with suppress(ProcessLookupError):
                await process.wait()
            timeout_msg = f"Judge timed out after {timeout_seconds} seconds"
            await self._handle_judge_failure(submission_id, user_id, timeout_msg)
            return
        except asyncio.CancelledError:
            # Kill entire process group
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except (ProcessLookupError, OSError):
                process.kill()
            with suppress(ProcessLookupError):
                await process.wait()
            raise

        stdout_text = stdout.decode().strip()
        stderr_text = stderr.decode().strip()
        if stdout_text:
            for line in stdout_text.splitlines():
                print(f"[judge {submission_id}] {line}")

        final_row = await repositories.fetch_submission_status(submission_id)
        if process.returncode != 0 and (final_row is None or final_row["status"] == "running"):
            error_message = format_judge_failure(process.returncode, stdout_text, stderr_text)
            await self._handle_judge_failure(submission_id, user_id, error_message)
            final_row = await repositories.fetch_submission_status(submission_id)

        await self._broadcaster.publish(
            user_id,
            schemas.submission_update_payload(
                final_row,
                submission_id,
                "graded" if process.returncode == 0 else "failed",
            ),
        )

    async def _handle_judge_failure(self, submission_id: str, user_id: str, error: str) -> None:
        """Handle judge failure with automatic retry or DLQ."""
        result = await repositories.increment_submission_retry(submission_id, error)
        if result["action"] == "retry":
            print(f"[judge {submission_id}] Auto-retry {result['retries']}/3: {error[:100]}")
            self.notify()  # Wake worker to pick up re-queued job
        elif result["action"] == "dlq":
            print(f"[judge {submission_id}] Moved to DLQ after {result['retries']} retries: {error[:100]}")

    async def _get_submission_filepath(self, submission_id: str) -> Path | None:
        """Fetch filepath for a submission directly from the database."""
        async with aiosqlite.connect(str(get_sqlite_path())) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                'SELECT "filepath" FROM "Submission" WHERE "id" = ?',
                (submission_id,)
            )
            row = await cursor.fetchone()
            return Path(row["filepath"]) if row else None


def format_judge_failure(returncode: int | None, stdout_text: str, stderr_text: str) -> str:
    detail = stderr_text or stdout_text
    if returncode is None:
        summary = "Judge exited without a return code"
    elif returncode < 0:
        signal_number = -returncode
        try:
            signal_name = signal.Signals(signal_number).name
        except ValueError:
            signal_name = f"signal {signal_number}"
        summary = f"Judge terminated by signal {signal_number} ({signal_name})"
    else:
        summary = f"Judge exited with code {returncode}"

    return f"{summary}\n{detail}" if detail else summary
