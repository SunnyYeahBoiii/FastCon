import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  REJUDGE_ELIGIBLE_STATUSES,
  hasEvaluateCodeChanged,
} from "@/lib/evaluateCodeRejudge";
import { requireAdminApi } from "@/lib/guard";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = params;
  const contest = await prisma.contest.findUnique({
    where: { id },
    select: { evaluateCode: true },
  });

  if (!contest) {
    return NextResponse.json(
      { ok: false, error: "Contest not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    evaluateCode: contest.evaluateCode,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { id } = params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const input = body as { evaluateCode?: unknown };
    const nextEvaluateCode =
      typeof input.evaluateCode === "string" ? input.evaluateCode : null;

    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { id: true, evaluateCode: true },
    });

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }

    const evaluateCodeChanged = hasEvaluateCodeChanged(
      contest.evaluateCode,
      nextEvaluateCode
    );

    if (!evaluateCodeChanged) {
      const updatedContest = await prisma.contest.update({
        where: { id },
        data: { evaluateCode: nextEvaluateCode },
      });

      return NextResponse.json({
        ok: true,
        contest: updatedContest,
        evaluateCodeChanged,
        requeuedCount: 0,
      });
    }

    const [updatedContest, requeued] = await prisma.$transaction([
      prisma.contest.update({
        where: { id },
        data: { evaluateCode: nextEvaluateCode },
      }),
      prisma.submission.updateMany({
        where: {
          contestId: id,
          status: { in: [...REJUDGE_ELIGIBLE_STATUSES] },
        },
        data: {
          status: "queued",
          score: null,
          metrics: null,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      contest: updatedContest,
      evaluateCodeChanged,
      requeuedCount: requeued.count,
    });
  } catch (error) {
    console.error("Update evaluate code error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
