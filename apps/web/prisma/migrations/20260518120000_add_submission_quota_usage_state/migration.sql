-- Add quota settlement state to keep submission quota accounting independent
-- from later admin rejudge status changes.
ALTER TABLE "Submission" ADD COLUMN "quotaUsageState" TEXT NOT NULL DEFAULT 'pending';

UPDATE "Submission"
SET "quotaUsageState" = CASE
  WHEN "status" = 'graded' AND "score" IS NOT NULL THEN 'counted'
  WHEN "status" = 'failed' THEN 'refunded'
  ELSE 'pending'
END;
