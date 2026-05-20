import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/guard";
import {
  buildSubmissionQuotaSnapshot,
  isSubmissionInQuotaWindow,
  isQuotaDebited,
} from "@/lib/submissionQuota";

type RouteParams = { params: { id: string } };

async function fetchContestQuotaEntries(contestId: string) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      title: true,
      deadline: true,
      dailySubmissionLimit: true,
    },
  });
  if (!contest) return null;

  const [users, quotaWindows, submissions] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
    }),
    prisma.submissionQuotaWindow.findMany({
      where: { contestId },
      select: {
        userId: true,
        windowStartedAt: true,
      },
    }),
    prisma.submission.findMany({
      where: { contestId },
      select: {
        userId: true,
        quotaUsageState: true,
        createdAt: true,
      },
    }),
  ]);

  const windowsByUserId = new Map(
    quotaWindows.map((quotaWindow) => [quotaWindow.userId, quotaWindow])
  );
  const serverNow = new Date();

  return {
    contest,
    entries: users.map((user) => {
      const quotaWindow = windowsByUserId.get(user.id);
      const used = quotaWindow
        ? submissions.filter(
            (submission) =>
              submission.userId === user.id &&
              isQuotaDebited(submission.quotaUsageState) &&
              isSubmissionInQuotaWindow(
                submission.createdAt,
                quotaWindow.windowStartedAt
              )
          ).length
        : 0;

      return {
        user,
        quota: buildSubmissionQuotaSnapshot({
          contestId,
          dailySubmissionLimit: contest.dailySubmissionLimit,
          deadline: contest.deadline,
          windowStartedAt: quotaWindow?.windowStartedAt ?? null,
          used,
          serverNow,
        }),
      };
    }),
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const data = await fetchContestQuotaEntries(params.id);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error("Fetch contest quota error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    const [contest, user] = await Promise.all([
      prisma.contest.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          title: true,
          deadline: true,
          dailySubmissionLimit: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
        },
      }),
    ]);

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    const resetResult = await prisma.submissionQuotaWindow.deleteMany({
      where: {
        contestId: params.id,
        userId,
      },
    });

    return NextResponse.json({
      ok: true,
      resetCount: resetResult.count,
      entry: {
        user,
        quota: buildSubmissionQuotaSnapshot({
          contestId: params.id,
          dailySubmissionLimit: contest.dailySubmissionLimit,
          deadline: contest.deadline,
          windowStartedAt: null,
          used: 0,
          serverNow: new Date(),
        }),
      },
    });
  } catch (error) {
    console.error("Reset contest quota error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
