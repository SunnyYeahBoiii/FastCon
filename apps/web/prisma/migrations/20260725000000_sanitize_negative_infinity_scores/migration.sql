-- Sanitize ±Infinity scores written by judge_runner before the NaN guard.
-- Prisma Float cannot deserialize ±Infinity, so reset them to NULL.
-- SQLite stores ±inf as REAL; no literal string comparison works.
UPDATE "Submission"
SET "score" = NULL
WHERE "score" IS NOT NULL
  AND ("score" < -1e308 OR "score" > 1e308);
