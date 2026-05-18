# Track Submission Quota Usage Separately from Judge Status

Submission quota accounting uses a dedicated `quotaUsageState` on each submission instead of deriving quota directly from `status`. This lets in-flight submissions count against quota, refunds failed first judge runs, and keeps admin rejudge from debiting or refunding quota again after the first result has already settled.

## Considered Options

- Use submission `status` only: simpler, but a failed submission requeued by an admin would become `queued` and consume quota again.
- Keep only `SubmissionQuotaWindow.submissionCount`: preserves the old counter, but cannot distinguish failed/refunded submissions from counted submissions.
- Add `quotaUsageState`: extra schema field, but records the quota decision once and keeps rejudge semantics stable.
