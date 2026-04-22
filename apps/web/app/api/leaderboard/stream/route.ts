import { prisma } from "@/lib/db";

export const maxDuration = 60;

function sendSSE(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  data: unknown
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function getPointsFromRank(rank: number): number {
  if (rank === 1) return 10;
  if (rank <= 3) return 9;
  if (rank <= 6) return 8;
  if (rank <= 11) return 7;
  return 0;
}

async function getLeaderboard(contestId: string | null) {
  const submissions = await prisma.submission.findMany({
    where: {
      status: "graded",
      score: { not: null },
      ...(contestId ? { contestId } : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      contest: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const bestScores = new Map<
    string,
    {
      userId: string;
      userName: string;
      contestId: string;
      contestTitle: string;
      score: number;
      submissionCount: number;
    }
  >();

  for (const sub of submissions) {
    const key = sub.userId;
    const existing = bestScores.get(key);
    if (!existing || sub.score! > existing.score) {
      bestScores.set(key, {
        userId: sub.user.id,
        userName: sub.user.name,
        contestId: sub.contestId,
        contestTitle: sub.contest.title,
        score: sub.score!,
        submissionCount: existing ? existing.submissionCount + 1 : 1,
      });
    }
  }

  // Step 1: sort by score, assign initial rank + recordPoints
  const withPoints = Array.from(bestScores.values())
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({
      rank: index + 1,
      recordPoints: getPointsFromRank(index + 1),
      ...entry,
    }));

  // Step 2: re-sort by recordPoints (desc), then score (desc) as tiebreak
  return withPoints
    .sort((a, b) => {
      if (b.recordPoints !== a.recordPoints) return b.recordPoints - a.recordPoints;
      return b.score - a.score;
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      recordPoints: getPointsFromRank(index + 1),
    }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contestId");

  const encoder = new TextEncoder();
  let lastCheckedAt = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const initial = await getLeaderboard(contestId);
      sendSSE(controller, encoder, { type: "initial", leaderboard: initial });

      const pollInterval = setInterval(async () => {
        try {
          const newGraded = await prisma.submission.findMany({
            where: {
              status: "graded",
              score: { not: null },
              createdAt: { gt: lastCheckedAt },
              ...(contestId ? { contestId } : {}),
            },
          });

          if (newGraded.length > 0) {
            lastCheckedAt = new Date();
            const updated = await getLeaderboard(contestId);
            sendSSE(controller, encoder, {
              type: "update",
              leaderboard: updated,
              newSubmissions: newGraded.length,
            });
          }
        } catch (err) {
          console.error("SSE poll error:", err);
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(pollInterval);
        sendSSE(controller, encoder, { type: "close" });
        controller.close();
      }, 55000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
