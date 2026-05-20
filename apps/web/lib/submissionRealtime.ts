export interface RealtimeSubmission {
  id: string;
  status: string;
  score: number | null;
  metrics: string | null;
}

export interface SubmissionStatusUpdate {
  submissionId?: string;
  status?: string;
  score?: number | null;
  metrics?: string | null;
}

function hasOwn(object: object, property: string) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

export function mergeSubmissionStatusUpdate<T extends RealtimeSubmission>(
  submissions: T[],
  update: SubmissionStatusUpdate
): { submissions: T[]; found: boolean } {
  if (!update.submissionId) {
    return { submissions, found: false };
  }

  let found = false;
  const nextSubmissions = submissions.map((submission) => {
    if (submission.id !== update.submissionId) {
      return submission;
    }

    found = true;
    const nextSubmission = { ...submission };
    if (typeof update.status === "string") {
      nextSubmission.status = update.status;
    }
    if (hasOwn(update, "score")) {
      nextSubmission.score = update.score ?? null;
    }
    if (hasOwn(update, "metrics")) {
      nextSubmission.metrics = update.metrics ?? null;
    }
    return nextSubmission;
  });

  return { submissions: nextSubmissions, found };
}
