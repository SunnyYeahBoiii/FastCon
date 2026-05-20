import { parseHoChiMinhDatetimeLocal } from "../../../lib/timeZone";

type ParseLimitResult =
  | { ok: true; value: number | null | undefined }
  | { ok: false; error: string };

type ParseDeadlineResult =
  | { ok: true; value: Date | null | undefined }
  | { ok: false; error: string };

export function parseDailySubmissionLimit(value: unknown): ParseLimitResult {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) {
      return { ok: false, error: "Submission limit must be a positive integer" };
    }
    return { ok: true, value };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return { ok: true, value: null };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, error: "Submission limit must be a positive integer" };
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (parsed < 1) {
      return { ok: false, error: "Submission limit must be a positive integer" };
    }
    return { ok: true, value: parsed };
  }

  return { ok: false, error: "Submission limit must be a positive integer" };
}

export function parseContestDeadline(value: unknown): ParseDeadlineResult {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "Deadline must be a valid datetime" };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return { ok: false, error: "Deadline must be a valid datetime" };
  }

  const deadline = parseHoChiMinhDatetimeLocal(value);
  if (!deadline) {
    return { ok: false, error: "Deadline must be a valid datetime" };
  }

  return { ok: true, value: deadline };
}
