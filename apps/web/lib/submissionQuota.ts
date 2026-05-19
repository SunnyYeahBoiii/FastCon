export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const QUOTA_USAGE_PENDING = "pending";
export const QUOTA_USAGE_COUNTED = "counted";
export const QUOTA_USAGE_REFUNDED = "refunded";

export interface SubmissionQuotaSnapshot {
  contestId: string;
  dailySubmissionLimit: number | null;
  deadline: string | null;
  serverNow: string;
  isDeadlinePassed: boolean;
  used: number;
  remaining: number | null;
  windowStartedAt: string | null;
  resetAt: string | null;
  isLimited: boolean;
  isQuotaExceeded: boolean;
}

export function isQuotaDebited(quotaUsageState: string) {
  return (
    quotaUsageState === QUOTA_USAGE_PENDING ||
    quotaUsageState === QUOTA_USAGE_COUNTED
  );
}

function normalizeLimit(limit: number | null | undefined) {
  return typeof limit === "number" && limit > 0 ? limit : null;
}

function timestampSecond(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

export function isSubmissionInQuotaWindow(
  submissionCreatedAt: Date | string,
  windowStartedAt: Date | string
) {
  const submissionSecond = timestampSecond(submissionCreatedAt);
  const windowSecond = timestampSecond(windowStartedAt);
  return (
    submissionSecond !== null &&
    windowSecond !== null &&
    submissionSecond >= windowSecond
  );
}

export function buildSubmissionQuotaSnapshot({
  contestId,
  dailySubmissionLimit,
  deadline,
  windowStartedAt,
  used,
  serverNow = new Date(),
}: {
  contestId: string;
  dailySubmissionLimit: number | null | undefined;
  deadline?: Date | string | null;
  windowStartedAt?: Date | string | null;
  used: number;
  serverNow?: Date;
}): SubmissionQuotaSnapshot {
  const limit = normalizeLimit(dailySubmissionLimit);
  const deadlineDate = deadline ? new Date(deadline) : null;
  const isDeadlinePassed = Boolean(deadlineDate && serverNow > deadlineDate);

  if (limit === null) {
    return {
      contestId,
      dailySubmissionLimit: null,
      deadline: deadlineDate?.toISOString() ?? null,
      serverNow: serverNow.toISOString(),
      isDeadlinePassed,
      used: 0,
      remaining: null,
      windowStartedAt: null,
      resetAt: null,
      isLimited: false,
      isQuotaExceeded: false,
    };
  }

  const startedAt = windowStartedAt ? new Date(windowStartedAt) : null;
  if (!startedAt) {
    return {
      contestId,
      dailySubmissionLimit: limit,
      deadline: deadlineDate?.toISOString() ?? null,
      serverNow: serverNow.toISOString(),
      isDeadlinePassed,
      used: 0,
      remaining: limit,
      windowStartedAt: null,
      resetAt: null,
      isLimited: true,
      isQuotaExceeded: false,
    };
  }

  const resetAt = new Date(startedAt.getTime() + QUOTA_WINDOW_MS);
  if (serverNow >= resetAt) {
    return {
      contestId,
      dailySubmissionLimit: limit,
      deadline: deadlineDate?.toISOString() ?? null,
      serverNow: serverNow.toISOString(),
      isDeadlinePassed,
      used: 0,
      remaining: limit,
      windowStartedAt: null,
      resetAt: null,
      isLimited: true,
      isQuotaExceeded: false,
    };
  }

  const normalizedUsed = Math.max(0, used);
  return {
    contestId,
    dailySubmissionLimit: limit,
    deadline: deadlineDate?.toISOString() ?? null,
    serverNow: serverNow.toISOString(),
    isDeadlinePassed,
    used: normalizedUsed,
    remaining: Math.max(0, limit - normalizedUsed),
    windowStartedAt: startedAt.toISOString(),
    resetAt: resetAt.toISOString(),
    isLimited: true,
    isQuotaExceeded: normalizedUsed >= limit,
  };
}
