export const REJUDGE_ELIGIBLE_STATUSES = ["graded", "failed"] as const;

export function hasEvaluateCodeChanged(
  currentEvaluateCode: string | null,
  nextEvaluateCode: string | null
) {
  return currentEvaluateCode !== nextEvaluateCode;
}
