from __future__ import annotations

import asyncio
import shutil
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import repositories, schemas
from .config import (
    APP_ROOT,
    get_judge_timeout_seconds,
    get_pending_upload_timeout_seconds,
    get_python_bin,
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
        next_stale_check = 0.0
        try:
            while not self._stop_event.is_set():
                now = asyncio.get_running_loop().time()
                if now >= next_stale_check:
                    await self._fail_stale_uploads(pending_upload_timeout_seconds)
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
        script_path = Path(APP_ROOT) / "scripts" / "judge_runner.py"
        process = await asyncio.create_subprocess_exec(
            get_python_bin(),
            str(script_path),
            submission_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(APP_ROOT),
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=get_judge_timeout_seconds(),
            )
        except asyncio.TimeoutError:
            process.kill()
            with suppress(ProcessLookupError):
                await process.wait()
            await repositories.fail_submission_with_error(
                submission_id,
                f"Judge timed out after {get_judge_timeout_seconds()} seconds",
            )
            final_row = await repositories.fetch_submission_status(submission_id)
            await self._broadcaster.publish(
                user_id,
                schemas.submission_update_payload(final_row, submission_id, "failed"),
            )
            return
        except asyncio.CancelledError:
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
            error_message = stderr_text or stdout_text or f"Judge exited with code {process.returncode}"
            await repositories.fail_submission_with_error(submission_id, error_message)
            final_row = await repositories.fetch_submission_status(submission_id)

        await self._broadcaster.publish(
            user_id,
            schemas.submission_update_payload(
                final_row,
                submission_id,
                "graded" if process.returncode == 0 else "failed",
            ),
        )
