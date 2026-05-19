import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubmissionQuotaSnapshot,
  isSubmissionInQuotaWindow,
  isQuotaDebited,
  QUOTA_USAGE_COUNTED,
  QUOTA_USAGE_PENDING,
  QUOTA_USAGE_REFUNDED,
} from "../lib/submissionQuota";

test("quota debit states count pending and counted only", () => {
  assert.equal(isQuotaDebited(QUOTA_USAGE_PENDING), true);
  assert.equal(isQuotaDebited(QUOTA_USAGE_COUNTED), true);
  assert.equal(isQuotaDebited(QUOTA_USAGE_REFUNDED), false);
  assert.equal(isQuotaDebited("failed"), false);
});

test("quota window comparison matches sqlite second precision", () => {
  assert.equal(
    isSubmissionInQuotaWindow(
      new Date("2026-04-22T12:53:56.000Z"),
      new Date("2026-04-22T12:53:56.832Z")
    ),
    true
  );
  assert.equal(
    isSubmissionInQuotaWindow(
      new Date("2026-04-22T12:53:55.999Z"),
      new Date("2026-04-22T12:53:56.000Z")
    ),
    false
  );
});

test("active quota snapshot keeps used count until reset", () => {
  const startedAt = new Date("2026-05-18T01:00:00.000Z");
  const serverNow = new Date("2026-05-18T02:00:00.000Z");

  const snapshot = buildSubmissionQuotaSnapshot({
    contestId: "c1",
    dailySubmissionLimit: 3,
    windowStartedAt: startedAt,
    used: 2,
    serverNow,
  });

  assert.equal(snapshot.used, 2);
  assert.equal(snapshot.remaining, 1);
  assert.equal(snapshot.windowStartedAt, startedAt.toISOString());
  assert.equal(snapshot.resetAt, "2026-05-19T01:00:00.000Z");
});

test("expired quota snapshot resets used count", () => {
  const snapshot = buildSubmissionQuotaSnapshot({
    contestId: "c1",
    dailySubmissionLimit: 3,
    windowStartedAt: new Date("2026-05-18T01:00:00.000Z"),
    used: 2,
    serverNow: new Date("2026-05-19T01:00:00.000Z"),
  });

  assert.equal(snapshot.used, 0);
  assert.equal(snapshot.remaining, 3);
  assert.equal(snapshot.windowStartedAt, null);
  assert.equal(snapshot.resetAt, null);
});
