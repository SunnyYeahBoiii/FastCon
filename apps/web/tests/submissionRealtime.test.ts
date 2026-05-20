import test from "node:test";
import assert from "node:assert/strict";

import { mergeSubmissionStatusUpdate } from "../lib/submissionRealtime";

const baseSubmission = {
  id: "sub-1",
  filename: "answer.pkl",
  status: "queued",
  score: 7.5,
  metrics: "{\"accuracy\":0.75}",
  createdAt: "2026-05-20T00:00:00.000Z",
  contest: { id: "contest-1", title: "Contest 1" },
};

test("mergeSubmissionStatusUpdate updates an existing submission", () => {
  const result = mergeSubmissionStatusUpdate([baseSubmission], {
    submissionId: "sub-1",
    status: "graded",
    score: 9,
    metrics: "{\"accuracy\":0.9}",
  });

  assert.equal(result.found, true);
  assert.deepEqual(result.submissions[0], {
    ...baseSubmission,
    status: "graded",
    score: 9,
    metrics: "{\"accuracy\":0.9}",
  });
});

test("mergeSubmissionStatusUpdate preserves omitted score and metrics fields", () => {
  const result = mergeSubmissionStatusUpdate([baseSubmission], {
    submissionId: "sub-1",
    status: "running",
  });

  assert.equal(result.found, true);
  const updated = result.submissions[0];
  assert.ok(updated);
  assert.equal(updated.status, "running");
  assert.equal(updated.score, 7.5);
  assert.equal(updated.metrics, "{\"accuracy\":0.75}");
});

test("mergeSubmissionStatusUpdate can clear nullable result fields", () => {
  const result = mergeSubmissionStatusUpdate([baseSubmission], {
    submissionId: "sub-1",
    status: "failed",
    score: null,
    metrics: null,
  });

  assert.equal(result.found, true);
  const updated = result.submissions[0];
  assert.ok(updated);
  assert.equal(updated.score, null);
  assert.equal(updated.metrics, null);
});

test("mergeSubmissionStatusUpdate reports unknown submissions for a refresh", () => {
  const result = mergeSubmissionStatusUpdate([baseSubmission], {
    submissionId: "sub-2",
    status: "graded",
    score: 10,
    metrics: null,
  });

  assert.equal(result.found, false);
  assert.deepEqual(result.submissions, [baseSubmission]);
});
