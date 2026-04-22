from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse

from . import repositories, schemas
from .auth import get_admin_user, get_current_user
from .config import get_max_upload_bytes, get_submissions_root
from .streams import SubmissionBroadcaster, default_event, named_event
from .worker import SubmissionWorker

broadcaster = SubmissionBroadcaster()
worker = SubmissionWorker(broadcaster)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await worker.start()
    app.state.worker = worker
    app.state.broadcaster = broadcaster
    try:
        yield
    finally:
        await worker.stop()


app = FastAPI(title="fast-con internal api", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else None
    message = first_error["msg"] if first_error else "Invalid request"
    return JSONResponse({"ok": False, "error": message}, status_code=status.HTTP_400_BAD_REQUEST)


@app.get("/api/submissions")
async def list_submissions(_admin_user: dict = Depends(get_admin_user)):
    submissions = await repositories.fetch_admin_submissions()
    return {"submissions": [schemas.admin_submission_payload(row) for row in submissions]}


@app.post("/api/submissions")
async def create_submission(
    request: Request,
    file: UploadFile = File(...),
    contest_id: str = Form(..., alias="contestId"),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]

    filename = Path(file.filename or "").name
    if not filename or not filename.endswith(".pkl"):
        return JSONResponse(
            {"ok": False, "error": "File must be a .pkl file"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if request.headers.get("content-length"):
        try:
            if int(request.headers["content-length"]) > get_max_upload_bytes():
                return JSONResponse(
                    {"ok": False, "error": "File is too large"},
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
        except ValueError:
            pass

    contest = await repositories.fetch_contest(contest_id)
    if contest is None:
        return JSONResponse(
            {"ok": False, "error": "Contest not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    contents = await file.read()
    if len(contents) > get_max_upload_bytes():
        return JSONResponse(
            {"ok": False, "error": "File is too large"},
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    submissions_root = get_submissions_root()
    await asyncio.to_thread(submissions_root.mkdir, parents=True, exist_ok=True)

    saved_filename = f"{int(time.time() * 1000)}_{filename}"
    filepath = submissions_root / saved_filename
    file_written = False
    try:
        await asyncio.to_thread(filepath.write_bytes, contents)
        file_written = True
        submission_result = await repositories.create_submission_with_quota(
            user_id=user_id,
            contest_id=contest_id,
            filename=saved_filename,
            filepath=str(filepath),
        )
    except Exception:
        if file_written:
            await asyncio.to_thread(filepath.unlink, missing_ok=True)
        raise

    if not submission_result["ok"]:
        if file_written:
            await asyncio.to_thread(filepath.unlink, missing_ok=True)

        if submission_result["reason"] == "contest_not_found":
            return JSONResponse(
                {"ok": False, "error": "Contest not found"},
                status_code=status.HTTP_404_NOT_FOUND,
            )

        if submission_result["reason"] == "submission_limit_reached":
            return JSONResponse(
                {
                    "ok": False,
                    "code": "SUBMISSION_LIMIT_REACHED",
                    "error": "You have reached the submission limit for this contest",
                    "quota": schemas.quota_snapshot_payload(submission_result["quota"]),
                },
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        return JSONResponse(
            {"ok": False, "error": "Unable to create submission"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    request.app.state.worker.notify()

    return {
        "ok": True,
        "submissionId": submission_result["submissionId"],
        "quota": schemas.quota_snapshot_payload(submission_result["quota"]),
    }


@app.get("/api/submissions/user")
async def list_current_user_submissions(current_user: dict = Depends(get_current_user)):
    submissions = await repositories.fetch_user_submissions(current_user["id"])
    return {"submissions": [schemas.user_submission_payload(row) for row in submissions]}


@app.get("/api/submissions/quota")
async def submission_quota(
    contest_id: str = Query(..., alias="contestId"),
    current_user: dict = Depends(get_current_user),
):
    quota = await repositories.fetch_submission_quota(current_user["id"], contest_id)
    if quota is None:
        return JSONResponse(
            {"ok": False, "error": "Contest not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    return {"ok": True, "quota": schemas.quota_snapshot_payload(quota)}


@app.get("/api/submissions/stream")
async def submission_stream(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    initial_rows = await repositories.fetch_user_submissions(user_id, limit=20)
    queue, unsubscribe = await request.app.state.broadcaster.subscribe(user_id)

    async def event_generator():
        started_at = asyncio.get_running_loop().time()
        poll_deadline = started_at + 15
        heartbeat_deadline = started_at + 15

        try:
            yield named_event(
                "initial",
                {"submissions": [schemas.user_submission_payload(row) for row in initial_rows]},
            )

            while True:
                if await request.is_disconnected():
                    break

                now = asyncio.get_running_loop().time()
                if now - started_at >= 55:
                    break

                next_deadline = min(poll_deadline, heartbeat_deadline, started_at + 55)
                timeout = max(0.1, next_deadline - now)

                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=timeout)
                    yield named_event("update", payload)
                    continue
                except asyncio.TimeoutError:
                    pass

                now = asyncio.get_running_loop().time()
                if now >= poll_deadline:
                    updated_rows = await repositories.fetch_user_submissions(user_id, limit=20)
                    yield named_event(
                        "poll_update",
                        {"submissions": [schemas.user_submission_payload(row) for row in updated_rows]},
                    )
                    poll_deadline = now + 15

                if now >= heartbeat_deadline:
                    yield ": keep-alive\n\n"
                    heartbeat_deadline = now + 15
        finally:
            await unsubscribe()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/submissions/{submission_id}")
async def submission_detail(submission_id: str, _admin_user: dict = Depends(get_admin_user)):
    submission = await repositories.fetch_submission_detail(submission_id)
    if submission is None:
        return JSONResponse(
            {"ok": False, "error": "Submission not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    return {"ok": True, "submission": schemas.submission_detail_payload(submission)}


@app.post("/api/submissions/{submission_id}/rerun")
async def rerun_submission(
    request: Request,
    submission_id: str,
    _admin_user: dict = Depends(get_admin_user),
):
    submission = await repositories.fetch_submission_status(submission_id)
    if submission is None:
        return JSONResponse(
            {"ok": False, "error": "Submission not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    await repositories.requeue_submission(submission_id)
    request.app.state.worker.notify()
    return {"ok": True}


@app.get("/api/leaderboard")
async def leaderboard(contest_id: str | None = Query(None, alias="contestId")):
    rows = await repositories.fetch_leaderboard_rows(contest_id)
    return {"leaderboard": schemas.build_leaderboard(rows)}


@app.get("/api/leaderboard/stream")
async def leaderboard_stream(
    request: Request,
    contest_id: str | None = Query(None, alias="contestId"),
):
    initial_rows = await repositories.fetch_leaderboard_rows(contest_id)
    initial_payload = schemas.build_leaderboard(initial_rows)
    last_serialized = json.dumps(initial_payload, sort_keys=True, separators=(",", ":"))

    async def event_generator():
        started_at = asyncio.get_running_loop().time()
        heartbeat_deadline = started_at + 15
        yield default_event({"type": "initial", "leaderboard": initial_payload})

        while True:
            if await request.is_disconnected():
                break

            now = asyncio.get_running_loop().time()
            if now - started_at >= 55:
                break

            sleep_for = max(0.1, min(2, heartbeat_deadline - now, started_at + 55 - now))
            await asyncio.sleep(sleep_for)

            if await request.is_disconnected():
                break

            rows = await repositories.fetch_leaderboard_rows(contest_id)
            updated = schemas.build_leaderboard(rows)
            serialized = json.dumps(updated, sort_keys=True, separators=(",", ":"))
            if serialized != last_serialized:
                last_serialized = serialized
                yield default_event(
                    {
                        "type": "update",
                        "leaderboard": updated,
                        "newSubmissions": 0,
                    }
                )

            now = asyncio.get_running_loop().time()
            if now >= heartbeat_deadline:
                yield ": keep-alive\n\n"
                heartbeat_deadline = now + 15

        if not await request.is_disconnected():
            yield default_event({"type": "close"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
