from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse

from . import repositories, schemas
from .auth import get_admin_user, get_current_user
from .config import get_submissions_root
from .streams import SubmissionBroadcaster, default_event, named_event
from .worker import SubmissionWorker

broadcaster = SubmissionBroadcaster()
worker = SubmissionWorker(broadcaster)


def _safe_submission_filename(raw_filename: str | None) -> str | None:
    filename = Path(raw_filename or "").name
    if not filename or not filename.endswith(".pkl"):
        return None
    return filename


def _submission_storage_path(filename: str) -> tuple[str, Path]:
    saved_filename = f"{time.time_ns()}_{filename}"
    return saved_filename, get_submissions_root() / saved_filename


def _write_upload_file(file: UploadFile, filepath: Path) -> None:
    part_path = filepath.with_name(f"{filepath.name}.part")
    try:
        with part_path.open("wb") as destination:
            shutil.copyfileobj(file.file, destination, length=1024 * 1024)
        part_path.replace(filepath)
    except Exception:
        part_path.unlink(missing_ok=True)
        filepath.unlink(missing_ok=True)
        raise


def _part_path(filepath: Path) -> Path:
    return filepath.with_name(f"{filepath.name}.part")


def _file_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def _truncate_file(path: Path, size: int) -> None:
    with path.open("ab") as file:
        file.truncate(size)


@dataclass(frozen=True)
class FlowChunkParams:
    chunk_number: int
    total_chunks: int
    chunk_size: int
    total_size: int
    identifier: str
    filename: str


def _flow_parts_dir(filepath: Path) -> Path:
    return filepath.with_name(f"{filepath.name}.parts")


def _flow_part_path(filepath: Path, chunk_number: int) -> Path:
    return _flow_parts_dir(filepath) / f"{chunk_number:06d}.part"


def _expected_flow_chunk_size(params: FlowChunkParams) -> int:
    start = (params.chunk_number - 1) * params.chunk_size
    end = min(start + params.chunk_size, params.total_size)
    return max(0, end - start)


def _validate_flow_chunk_params(params: FlowChunkParams, expected_total_size: int) -> str | None:
    if params.chunk_number < 1:
        return "flowChunkNumber must start at 1"
    if params.total_chunks < 1:
        return "flowTotalChunks must be positive"
    if params.chunk_size < 1:
        return "flowChunkSize must be positive"
    if params.total_size != expected_total_size:
        return "flowTotalSize does not match pending upload"
    if params.chunk_number > params.total_chunks:
        return "flowChunkNumber exceeds flowTotalChunks"
    if params.filename and not _safe_submission_filename(params.filename):
        return "flowFilename must be a .pkl file"
    expected_chunks = (params.total_size + params.chunk_size - 1) // params.chunk_size
    if params.total_chunks != expected_chunks:
        return "flowTotalChunks does not match flowTotalSize and flowChunkSize"
    if _expected_flow_chunk_size(params) <= 0:
        return "Chunk is outside upload length"
    return None


def _flow_params_from_values(
    *,
    flow_chunk_number: int,
    flow_total_chunks: int,
    flow_chunk_size: int,
    flow_total_size: int,
    flow_identifier: str,
    flow_filename: str,
) -> FlowChunkParams:
    return FlowChunkParams(
        chunk_number=flow_chunk_number,
        total_chunks=flow_total_chunks,
        chunk_size=flow_chunk_size,
        total_size=flow_total_size,
        identifier=flow_identifier,
        filename=flow_filename,
    )


def _flow_params_for_chunk(params: FlowChunkParams, chunk_number: int) -> FlowChunkParams:
    return FlowChunkParams(
        chunk_number=chunk_number,
        total_chunks=params.total_chunks,
        chunk_size=params.chunk_size,
        total_size=params.total_size,
        identifier=params.identifier,
        filename=params.filename,
    )


async def _store_flow_chunk(request: Request, filepath: Path, params: FlowChunkParams) -> int:
    parts_dir = _flow_parts_dir(filepath)
    await asyncio.to_thread(parts_dir.mkdir, parents=True, exist_ok=True)
    target_path = _flow_part_path(filepath, params.chunk_number)
    temp_path = parts_dir / f"{target_path.name}.{uuid.uuid4().hex}.tmp"

    bytes_written = 0
    destination = None
    try:
        destination = await asyncio.to_thread(temp_path.open, "wb")
        async for chunk in request.stream():
            if not chunk:
                continue
            bytes_written += len(chunk)
            await asyncio.to_thread(destination.write, chunk)
        await asyncio.to_thread(destination.close)
        destination = None

        expected_size = _expected_flow_chunk_size(params)
        if bytes_written != expected_size:
            await asyncio.to_thread(temp_path.unlink, missing_ok=True)
            raise ValueError("Flow chunk size mismatch")

        await asyncio.to_thread(temp_path.replace, target_path)
        return bytes_written
    except Exception:
        if destination is not None:
            await asyncio.to_thread(destination.close)
        await asyncio.to_thread(temp_path.unlink, missing_ok=True)
        raise


def _sum_flow_received_bytes(filepath: Path, params: FlowChunkParams) -> int:
    total = 0
    for chunk_number in range(1, params.total_chunks + 1):
        chunk_params = _flow_params_for_chunk(params, chunk_number)
        part_path = _flow_part_path(filepath, chunk_number)
        if part_path.exists() and part_path.stat().st_size == _expected_flow_chunk_size(chunk_params):
            total += _expected_flow_chunk_size(chunk_params)
    return total


def _all_flow_parts_present(filepath: Path, params: FlowChunkParams) -> bool:
    return _sum_flow_received_bytes(filepath, params) == params.total_size


def _merge_flow_parts(filepath: Path, params: FlowChunkParams) -> None:
    part_filepath = _part_path(filepath)
    part_filepath.parent.mkdir(parents=True, exist_ok=True)
    try:
        with part_filepath.open("wb") as output:
            for chunk_number in range(1, params.total_chunks + 1):
                part_path = _flow_part_path(filepath, chunk_number)
                with part_path.open("rb") as input_file:
                    shutil.copyfileobj(input_file, output)
        if part_filepath.stat().st_size != params.total_size:
            raise ValueError("Merged upload size mismatch")
        part_filepath.replace(filepath)
        shutil.rmtree(_flow_parts_dir(filepath), ignore_errors=True)
    except Exception:
        part_filepath.unlink(missing_ok=True)
        raise


async def _stream_request_to_file(request: Request, filepath: Path) -> int:
    part_path = _part_path(filepath)
    bytes_written = 0
    destination = None
    try:
        await asyncio.to_thread(part_path.unlink, missing_ok=True)
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        destination = await asyncio.to_thread(part_path.open, "wb")
        async for chunk in request.stream():
            if not chunk:
                continue
            bytes_written += len(chunk)
            await asyncio.to_thread(destination.write, chunk)
        await asyncio.to_thread(destination.close)
        destination = None
        await asyncio.to_thread(part_path.replace, filepath)
        return bytes_written
    except Exception:
        if destination is not None:
            await asyncio.to_thread(destination.close)
        await asyncio.to_thread(part_path.unlink, missing_ok=True)
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        raise


async def _append_request_to_part_file(
    request: Request,
    filepath: Path,
    *,
    expected_offset: int,
) -> int:
    part_path = _part_path(filepath)
    await asyncio.to_thread(part_path.parent.mkdir, parents=True, exist_ok=True)

    actual_offset = await asyncio.to_thread(_file_size, part_path)
    if actual_offset != expected_offset:
        raise ValueError(
            f"Part file offset mismatch: expected {expected_offset}, got {actual_offset}"
        )

    bytes_written = 0
    destination = None
    try:
        destination = await asyncio.to_thread(part_path.open, "ab")
        async for chunk in request.stream():
            if not chunk:
                continue
            bytes_written += len(chunk)
            await asyncio.to_thread(destination.write, chunk)
        await asyncio.to_thread(destination.close)
        destination = None
        return bytes_written
    except Exception:
        if destination is not None:
            await asyncio.to_thread(destination.close)
        await asyncio.to_thread(_truncate_file, part_path, expected_offset)
        raise


async def _finalize_part_file(filepath: Path) -> None:
    part_path = _part_path(filepath)
    await asyncio.to_thread(part_path.replace, filepath)


def _parse_positive_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _parse_non_negative_int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _check_disk_space(required_bytes: int) -> tuple[bool, int]:
    """Check if there's enough disk space. Returns (ok, free_bytes)."""
    root = get_submissions_root()
    try:
        usage = shutil.disk_usage(str(root))
        # Require 1.5x file size + 5GB buffer
        needed = int(required_bytes * 1.5) + 5 * 1024**3
        return usage.free >= needed, usage.free
    except OSError:
        return True, 0  # If we can't check, allow the upload


def _compute_sha256(filepath: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with filepath.open("rb") as f:
        while True:
            chunk = f.read(8 * 1024 * 1024)  # 8MB chunks
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


async def _merge_flow_parts_parallel(filepath: Path, params: FlowChunkParams, broadcaster: SubmissionBroadcaster | None = None) -> None:
    """Merge flow parts using parallel reads for I/O bound chunks."""
    part_filepath = _part_path(filepath)
    part_filepath.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Read all chunks in parallel (I/O bound)
        async def _read_chunk(chunk_number: int) -> bytes:
            part_path = _flow_part_path(filepath, chunk_number)
            return await asyncio.to_thread(part_path.read_bytes)

        chunks = await asyncio.gather(*[
            _read_chunk(chunk_number)
            for chunk_number in range(1, params.total_chunks + 1)
        ])

        # Write sequentially
        with part_filepath.open("wb") as output:
            total_chunks = len(chunks)
            for i, chunk_data in enumerate(chunks):
                output.write(chunk_data)
                # Broadcast progress every 25%
                if broadcaster and total_chunks > 4 and (i + 1) % max(1, total_chunks // 4) == 0:
                    percent = int(((i + 1) / total_chunks) * 100)
                    await broadcaster.publish(
                        "",  # user_id empty for progress broadcast
                        {"type": "merge_progress", "percent": percent},
                    )

        if part_filepath.stat().st_size != params.total_size:
            raise ValueError("Merged upload size mismatch")
        part_filepath.replace(filepath)
        shutil.rmtree(_flow_parts_dir(filepath), ignore_errors=True)
    except Exception:
        part_filepath.unlink(missing_ok=True)
        raise


def _upload_progress_headers(offset: int, total: int | None) -> dict[str, str]:
    headers = {
        "Upload-Offset": str(offset),
        "Tus-Resumable": "1.0.0",
    }
    if total is not None:
        headers["Upload-Length"] = str(total)
    return headers


def _submission_failure_response(submission_result: dict) -> JSONResponse:
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

    if submission_result["reason"] == "deadline_passed":
        return JSONResponse(
            {
                "ok": False,
                "code": "CONTEST_DEADLINE_PASSED",
                "error": "Contest submission deadline has passed",
                "quota": schemas.quota_snapshot_payload(submission_result["quota"]),
            },
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if submission_result["reason"] == "contest_closed":
        return JSONResponse(
            {
                "ok": False,
                "code": "CONTEST_CLOSED",
                "error": "Contest is no longer accepting submissions",
                "quota": schemas.quota_snapshot_payload(submission_result["quota"]),
            },
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    return JSONResponse(
        {"ok": False, "error": "Unable to create submission"},
        status_code=status.HTTP_400_BAD_REQUEST,
    )



@asynccontextmanager
async def lifespan(app: FastAPI):
    submissions_root = get_submissions_root()
    await asyncio.to_thread(submissions_root.mkdir, parents=True, exist_ok=True)
    await repositories.ensure_runtime_schema()
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


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    print(f"Unhandled API error: {exc}")
    return JSONResponse(
        {"ok": False, "error": "Internal server error"},
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


STARTED_AT = time.time()


@app.get("/api/lifecheck")
async def lifecheck():
    # Lightweight liveness probe for load balancers / uptime monitors.
    # Keep it dependency-free (no DB / auth calls).
    return {
        "ok": True,
        "service": "fast-con internal api",
        "uptimeSeconds": int(time.time() - STARTED_AT),
    }


@app.get("/api/submissions")
async def list_submissions(_admin_user: dict = Depends(get_admin_user)):
    submissions = await repositories.fetch_admin_submissions()
    return {"submissions": [schemas.admin_submission_payload(row) for row in submissions]}


@app.post("/api/submissions/init")
async def init_submission_upload(request: Request, current_user: dict = Depends(get_current_user)):
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        return JSONResponse(
            {"ok": False, "error": "Invalid JSON body"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if not isinstance(payload, dict):
        return JSONResponse(
            {"ok": False, "error": "Invalid JSON body"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    contest_id = str(payload.get("contestId") or "")
    filename = _safe_submission_filename(str(payload.get("filename") or ""))
    upload_total_bytes = _parse_positive_int(str(payload.get("totalBytes") or ""))
    if not filename:
        return JSONResponse(
            {"ok": False, "error": "File must be a .pkl file"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Disk space check
    if upload_total_bytes is not None:
        ok, free_bytes = _check_disk_space(upload_total_bytes)
        if not ok:
            return JSONResponse(
                {
                    "ok": False,
                    "code": "STORAGE_FULL",
                    "error": f"Insufficient storage. Available: {free_bytes // (1024**3)}GB, needed: {upload_total_bytes // (1024**3)}GB",
                },
                status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            )

    saved_filename, filepath = _submission_storage_path(filename)
    submission_result = await repositories.prepare_submission_upload_with_quota(
        user_id=current_user["id"],
        contest_id=contest_id,
        filename=saved_filename,
        filepath=str(filepath),
        upload_total_bytes=upload_total_bytes,
    )
    if not submission_result["ok"]:
        return _submission_failure_response(submission_result)

    return {
        "ok": True,
        "submissionId": submission_result["submissionId"],
        "uploadOffset": 0,
        "uploadTotalBytes": upload_total_bytes,
        "quota": schemas.quota_snapshot_payload(submission_result["quota"]),
    }


@app.head("/api/submissions/{submission_id}/file")
async def get_submission_upload_offset(
    submission_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=user_id,
    )
    if pending_upload is None:
        return Response(status_code=status.HTTP_404_NOT_FOUND)

    offset = int(pending_upload["uploadReceivedBytes"] or 0)
    total = pending_upload["uploadTotalBytes"]
    return Response(headers=_upload_progress_headers(offset, total))


@app.api_route("/api/submissions/{submission_id}/flow-chunks", methods=["GET", "HEAD"])
async def test_submission_flow_chunk(
    submission_id: str,
    flow_chunk_number: int = Query(..., alias="flowChunkNumber"),
    flow_total_chunks: int = Query(..., alias="flowTotalChunks"),
    flow_chunk_size: int = Query(..., alias="flowChunkSize"),
    flow_total_size: int = Query(..., alias="flowTotalSize"),
    flow_identifier: str = Query("", alias="flowIdentifier"),
    flow_filename: str = Query("", alias="flowFilename"),
    current_user: dict = Depends(get_current_user),
):
    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=current_user["id"],
    )
    if pending_upload is None:
        return Response(status_code=status.HTTP_404_NOT_FOUND)

    total_bytes = pending_upload["uploadTotalBytes"]
    if not isinstance(total_bytes, int) or total_bytes <= 0:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    params = _flow_params_from_values(
        flow_chunk_number=flow_chunk_number,
        flow_total_chunks=flow_total_chunks,
        flow_chunk_size=flow_chunk_size,
        flow_total_size=flow_total_size,
        flow_identifier=flow_identifier,
        flow_filename=flow_filename,
    )
    validation_error = _validate_flow_chunk_params(params, total_bytes)
    if validation_error is not None:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    part_path = _flow_part_path(Path(pending_upload["filepath"]), params.chunk_number)
    if part_path.exists() and part_path.stat().st_size == _expected_flow_chunk_size(params):
        return Response(status_code=status.HTTP_200_OK)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch("/api/submissions/{submission_id}/file")
async def upload_submission_file_chunk(
    request: Request,
    submission_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=user_id,
    )
    if pending_upload is None:
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    total_bytes = pending_upload["uploadTotalBytes"]
    if not isinstance(total_bytes, int) or total_bytes <= 0:
        return JSONResponse(
            {"ok": False, "error": "Chunked upload length is missing"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    current_offset = int(pending_upload["uploadReceivedBytes"] or 0)
    expected_offset = _parse_non_negative_int(request.headers.get("upload-offset"))
    if expected_offset is None:
        return JSONResponse(
            {"ok": False, "error": "Upload-Offset header is required"},
            status_code=status.HTTP_400_BAD_REQUEST,
            headers=_upload_progress_headers(current_offset, total_bytes),
        )

    if expected_offset != current_offset:
        return JSONResponse(
            {
                "ok": False,
                "code": "UPLOAD_OFFSET_MISMATCH",
                "error": "Upload offset mismatch",
                "uploadOffset": current_offset,
                "uploadTotalBytes": total_bytes,
            },
            status_code=status.HTTP_409_CONFLICT,
            headers=_upload_progress_headers(current_offset, total_bytes),
        )

    filepath = Path(pending_upload["filepath"])
    try:
        bytes_written = await _append_request_to_part_file(
            request,
            filepath,
            expected_offset=current_offset,
        )
    except ValueError:
        actual_offset = await asyncio.to_thread(_file_size, _part_path(filepath))
        return JSONResponse(
            {
                "ok": False,
                "code": "UPLOAD_OFFSET_MISMATCH",
                "error": "Upload offset mismatch",
                "uploadOffset": actual_offset,
                "uploadTotalBytes": total_bytes,
            },
            status_code=status.HTTP_409_CONFLICT,
            headers=_upload_progress_headers(actual_offset, total_bytes),
        )
    except Exception:
        # Keep the pending upload resumable after client disconnects. Stale upload
        # cleanup refunds quota if the user never retries.
        raise

    next_offset = current_offset + bytes_written
    if next_offset > total_bytes:
        await asyncio.to_thread(_truncate_file, _part_path(filepath), current_offset)
        return JSONResponse(
            {"ok": False, "error": "Chunk exceeds upload length"},
            status_code=status.HTTP_400_BAD_REQUEST,
            headers=_upload_progress_headers(current_offset, total_bytes),
        )

    updated = await repositories.update_submission_upload_progress(
        submission_id,
        user_id=user_id,
        received_bytes=next_offset,
    )
    if not updated:
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if next_offset < total_bytes:
        return JSONResponse(
            {
                "ok": True,
                "complete": False,
                "submissionId": submission_id,
                "bytesWritten": bytes_written,
                "uploadOffset": next_offset,
                "uploadTotalBytes": total_bytes,
            },
            headers=_upload_progress_headers(next_offset, total_bytes),
        )

    await _finalize_part_file(filepath)
    completed = await repositories.complete_submission_upload(submission_id, user_id=user_id)
    if not completed:
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    request.app.state.worker.notify()
    quota = await repositories.fetch_submission_quota(user_id, pending_upload["contestId"])
    return JSONResponse(
        {
            "ok": True,
            "complete": True,
            "submissionId": submission_id,
            "bytesWritten": bytes_written,
            "uploadOffset": next_offset,
            "uploadTotalBytes": total_bytes,
            "quota": schemas.quota_snapshot_payload(quota) if quota is not None else None,
        },
        headers=_upload_progress_headers(next_offset, total_bytes),
    )


@app.put("/api/submissions/{submission_id}/flow-chunks")
async def upload_submission_flow_chunk(
    request: Request,
    submission_id: str,
    flow_chunk_number: int = Query(..., alias="flowChunkNumber"),
    flow_total_chunks: int = Query(..., alias="flowTotalChunks"),
    flow_chunk_size: int = Query(..., alias="flowChunkSize"),
    flow_total_size: int = Query(..., alias="flowTotalSize"),
    flow_identifier: str = Query("", alias="flowIdentifier"),
    flow_filename: str = Query("", alias="flowFilename"),
    current_user: dict = Depends(get_current_user),
):
    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=current_user["id"],
    )
    if pending_upload is None:
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    total_bytes = pending_upload["uploadTotalBytes"]
    if not isinstance(total_bytes, int) or total_bytes <= 0:
        return JSONResponse(
            {"ok": False, "error": "Chunked upload length is missing"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    params = _flow_params_from_values(
        flow_chunk_number=flow_chunk_number,
        flow_total_chunks=flow_total_chunks,
        flow_chunk_size=flow_chunk_size,
        flow_total_size=flow_total_size,
        flow_identifier=flow_identifier,
        flow_filename=flow_filename,
    )
    validation_error = _validate_flow_chunk_params(params, total_bytes)
    if validation_error is not None:
        return JSONResponse(
            {"ok": False, "error": validation_error},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    filepath = Path(pending_upload["filepath"])
    try:
        bytes_written = await _store_flow_chunk(request, filepath, params)
    except ValueError:
        return JSONResponse(
            {"ok": False, "error": "Flow chunk size mismatch"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    received_bytes = await asyncio.to_thread(_sum_flow_received_bytes, filepath, params)
    await repositories.update_submission_upload_progress(
        submission_id,
        user_id=current_user["id"],
        received_bytes=received_bytes,
    )

    return JSONResponse(
        {
            "ok": True,
            "complete": False,
            "submissionId": submission_id,
            "chunkNumber": params.chunk_number,
            "bytesWritten": bytes_written,
            "uploadReceivedBytes": received_bytes,
            "uploadTotalBytes": params.total_size,
        },
        status_code=status.HTTP_200_OK,
    )


@app.post("/api/submissions/{submission_id}/flow-complete")
async def complete_submission_flow_upload(
    request: Request,
    submission_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        return JSONResponse(
            {"ok": False, "error": "Invalid JSON body"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=current_user["id"],
    )
    if pending_upload is None:
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    total_bytes = pending_upload["uploadTotalBytes"]
    if not isinstance(total_bytes, int) or total_bytes <= 0:
        return JSONResponse(
            {"ok": False, "error": "Chunked upload length is missing"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    params = FlowChunkParams(
        chunk_number=1,
        total_chunks=_parse_positive_int(str(payload.get("flowTotalChunks") or "")) or 0,
        chunk_size=_parse_positive_int(str(payload.get("flowChunkSize") or "")) or 0,
        total_size=_parse_positive_int(str(payload.get("flowTotalSize") or "")) or 0,
        identifier=str(payload.get("flowIdentifier") or ""),
        filename=str(payload.get("flowFilename") or ""),
    )
    validation_error = _validate_flow_chunk_params(params, total_bytes)
    if validation_error is not None:
        return JSONResponse(
            {"ok": False, "error": validation_error},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    filepath = Path(pending_upload["filepath"])
    if not await asyncio.to_thread(_all_flow_parts_present, filepath, params):
        received_bytes = await asyncio.to_thread(_sum_flow_received_bytes, filepath, params)
        return JSONResponse(
            {
                "ok": False,
                "code": "FLOW_CHUNKS_INCOMPLETE",
                "error": "Flow chunks are incomplete",
                "uploadReceivedBytes": received_bytes,
                "uploadTotalBytes": params.total_size,
            },
            status_code=status.HTTP_409_CONFLICT,
        )

    try:
        await _merge_flow_parts_parallel(filepath, params, broadcaster)
    except ValueError:
        return JSONResponse(
            {"ok": False, "error": "Merged upload size mismatch"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    await repositories.update_submission_upload_progress(
        submission_id,
        user_id=current_user["id"],
        received_bytes=params.total_size,
    )

    # Compute checksum for integrity
    try:
        file_checksum = await asyncio.to_thread(_compute_sha256, filepath)
        print(f"[upload {submission_id}] SHA-256: {file_checksum}")
    except Exception as e:
        print(f"[upload {submission_id}] Checksum computation failed: {e}")
        file_checksum = None

    completed = await repositories.complete_submission_upload(
        submission_id,
        user_id=current_user["id"],
    )
    if not completed:
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    request.app.state.worker.notify()
    quota = await repositories.fetch_submission_quota(current_user["id"], pending_upload["contestId"])
    return JSONResponse(
        {
            "ok": True,
            "complete": True,
            "submissionId": submission_id,
            "uploadReceivedBytes": params.total_size,
            "uploadTotalBytes": params.total_size,
            "quota": schemas.quota_snapshot_payload(quota) if quota is not None else None,
        },
        status_code=status.HTTP_200_OK,
    )


@app.put("/api/submissions/{submission_id}/file")
async def upload_submission_file(
    request: Request,
    submission_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=user_id,
    )
    if pending_upload is None:
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    filepath = Path(pending_upload["filepath"])
    await asyncio.to_thread(filepath.parent.mkdir, parents=True, exist_ok=True)

    try:
        bytes_written = await _stream_request_to_file(request, filepath)
        completed = await repositories.complete_submission_upload(submission_id, user_id=user_id)
    except Exception:
        await repositories.fail_submission_upload(
            submission_id,
            user_id=user_id,
            message="Upload failed before completion",
        )
        raise

    if not completed:
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    request.app.state.worker.notify()
    quota = await repositories.fetch_submission_quota(user_id, pending_upload["contestId"])
    return {
        "ok": True,
        "submissionId": submission_id,
        "bytesWritten": bytes_written,
        "quota": schemas.quota_snapshot_payload(quota) if quota is not None else None,
    }


@app.delete("/api/submissions/{submission_id}/upload")
async def cancel_submission_upload(
    submission_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    pending_upload = await repositories.fetch_pending_submission_upload(
        submission_id,
        user_id=user_id,
    )
    if pending_upload is not None:
        filepath = Path(pending_upload["filepath"])
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        await asyncio.to_thread(filepath.with_name(f"{filepath.name}.part").unlink, missing_ok=True)
        await asyncio.to_thread(shutil.rmtree, _flow_parts_dir(filepath), True)
        await repositories.fail_submission_upload(
            submission_id,
            user_id=user_id,
            message="Upload canceled",
        )

    return {"ok": True}


@app.post("/api/submissions")
async def create_submission(
    request: Request,
    file: UploadFile = File(...),
    contest_id: str = Form(..., alias="contestId"),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]

    filename = _safe_submission_filename(file.filename)
    if not filename:
        return JSONResponse(
            {"ok": False, "error": "File must be a .pkl file"},
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    saved_filename, filepath = _submission_storage_path(filename)
    submission_result = await repositories.prepare_submission_upload_with_quota(
        user_id=user_id,
        contest_id=contest_id,
        filename=saved_filename,
        filepath=str(filepath),
    )
    if not submission_result["ok"]:
        return _submission_failure_response(submission_result)

    try:
        await asyncio.to_thread(_write_upload_file, file, filepath)
        completed = await repositories.complete_submission_upload(
            submission_result["submissionId"],
            user_id=user_id,
        )
    except Exception:
        await repositories.fail_submission_upload(
            submission_result["submissionId"],
            user_id=user_id,
            message="Upload failed before completion",
        )
        raise

    if not completed:
        await asyncio.to_thread(filepath.unlink, missing_ok=True)
        return JSONResponse(
            {"ok": False, "error": "Pending upload not found"},
            status_code=status.HTTP_404_NOT_FOUND,
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
    scope: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if scope == "admin":
        if current_user["role"] != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        initial_rows = await repositories.fetch_admin_submissions()
        initial_payload = [schemas.admin_submission_payload(row) for row in initial_rows]
        last_serialized = json.dumps(initial_payload, sort_keys=True, separators=(",", ":"))

        async def admin_event_generator():
            nonlocal last_serialized
            started_at = asyncio.get_running_loop().time()
            heartbeat_deadline = started_at + 15
            yield default_event({"type": "initial", "submissions": initial_payload})

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

                updated_rows = await repositories.fetch_admin_submissions()
                updated = [schemas.admin_submission_payload(row) for row in updated_rows]
                serialized = json.dumps(updated, sort_keys=True, separators=(",", ":"))
                if serialized != last_serialized:
                    last_serialized = serialized
                    yield default_event({"type": "update", "submissions": updated})

                now = asyncio.get_running_loop().time()
                if now >= heartbeat_deadline:
                    yield ": keep-alive\n\n"
                    heartbeat_deadline = now + 15

            if not await request.is_disconnected():
                yield default_event({"type": "close"})

        return StreamingResponse(
            admin_event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

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
        nonlocal last_serialized
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
