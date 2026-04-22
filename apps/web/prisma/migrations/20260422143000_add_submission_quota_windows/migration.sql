-- CreateTable
CREATE TABLE "SubmissionQuotaWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "windowStartedAt" DATETIME NOT NULL,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionQuotaWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubmissionQuotaWindow_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Submission_userId_contestId_createdAt_idx" ON "Submission"("userId", "contestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionQuotaWindow_userId_contestId_key" ON "SubmissionQuotaWindow"("userId", "contestId");
