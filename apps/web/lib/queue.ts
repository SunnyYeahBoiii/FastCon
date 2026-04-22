import { prisma } from "./db";
import { runJudge } from "./judge";
import { emit } from "./events";
import { getWorkerMaxConcurrent, getWorkerPollMs } from "./runtimeConfig";

const MAX_CONCURRENT = getWorkerMaxConcurrent();
const POLL_INTERVAL_MS = getWorkerPollMs();

const activeJudges = new Set<string>();
let initialized = false;

/**
 * Reset any "running" submissions back to "queued" on server restart.
 * Handles cases where server crashed while judging was in progress.
 */
async function resetStaleRunning(): Promise<void> {
  await prisma.submission.updateMany({
    where: { status: "running" },
    data: { status: "queued" },
  });
}

/**
 * Process the queue: dequeue oldest "queued" submission if slots available.
 */
export async function processQueue(): Promise<void> {
  while (activeJudges.size < MAX_CONCURRENT) {
    const next = await prisma.submission.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true },
    });

    if (!next) return;

    activeJudges.add(next.id);
    await prisma.submission.update({
      where: { id: next.id },
      data: { status: "running" },
    });

    // Emit running status
    emit(`user:${next.userId}`, {
      type: "status_change",
      submissionId: next.id,
      status: "running",
    });

    // Fire judge, then cleanup on complete
    runJudge(next.id)
      .then(async () => {
        // Fetch final result from DB (judge_runner.py already updated it)
        const graded = await prisma.submission.findUnique({
          where: { id: next.id },
          select: { score: true, metrics: true, status: true },
        });
        emit(`user:${next.userId}`, {
          type: "status_change",
          submissionId: next.id,
          status: graded?.status || "graded",
          score: graded?.score,
          metrics: graded?.metrics,
        });
      })
      .catch(async (error) => {
        console.error("Judge execution error:", error);
        const failed = await prisma.submission.findUnique({
          where: { id: next.id },
          select: { metrics: true, status: true },
        });
        emit(`user:${next.userId}`, {
          type: "status_change",
          submissionId: next.id,
          status: failed?.status || "failed",
          metrics: failed?.metrics,
        });
      })
      .finally(() => {
        activeJudges.delete(next.id);
        // Trigger next dequeue immediately
        processQueue();
      });
  }
}

/**
 * Initialize the queue worker. Call once on server startup.
 */
export function initQueueWorker(): void {
  if (initialized) return;
  initialized = true;

  resetStaleRunning().then(() => {
    console.log(`[queue] Worker started, maxConcurrent=${MAX_CONCURRENT}`);
    processQueue();
  });

  // Periodic poll as safety net
  setInterval(processQueue, POLL_INTERVAL_MS);
}
