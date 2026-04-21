-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "metrics" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" TEXT NOT NULL DEFAULT 'custom',
    "groundTruthPath" TEXT,
    "evaluateCode" TEXT,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ongoing',
    "dailySubmissionLimit" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Contest" ("createdAt", "dailySubmissionLimit", "deadline", "description", "groundTruthPath", "id", "status", "title") SELECT "createdAt", "dailySubmissionLimit", "deadline", "description", "groundTruthPath", "id", "status", "title" FROM "Contest";
DROP TABLE "Contest";
ALTER TABLE "new_Contest" RENAME TO "Contest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
