import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contestId");

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
        userId: sub.userId,
        userName: sub.user.name,
        contestId: sub.contestId,
        contestTitle: sub.contest.title,
        score: sub.score!,
        submissionCount: existing ? existing.submissionCount + 1 : 1,
      });
    }
  }

  const leaderboard = Array.from(bestScores.values())
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  return NextResponse.json({ leaderboard });
}
