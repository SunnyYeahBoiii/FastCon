import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/guard";
import { parseDailySubmissionLimit } from "../validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { id } = await params;

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      contest,
    });
  } catch (error) {
    console.error("Fetch contest error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, deadline, status, dailySubmissionLimit } = body;
    const parsedLimit = parseDailySubmissionLimit(dailySubmissionLimit);

    const contest = await prisma.contest.findUnique({
      where: { id },
    });

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }
    if (!parsedLimit.ok) {
      return NextResponse.json(
        { ok: false, error: parsedLimit.error },
        { status: 400 }
      );
    }

    const updatedContest = await prisma.contest.update({
      where: { id },
      data: {
        title: title ?? contest.title,
        description: description ?? contest.description,
        deadline: deadline
          ? (() => {
              const [date, time] = deadline.split("T");
              const [y, m, d] = date.split("-").map(Number);
              const [h, min] = time.split(":").map(Number);
              return new Date(Date.UTC(y, m - 1, d, h, min));
            })()
          : contest.deadline,
        status: status ?? contest.status,
        dailySubmissionLimit:
          parsedLimit.value === undefined
            ? contest.dailySubmissionLimit
            : parsedLimit.value,
      },
    });

    return NextResponse.json({
      ok: true,
      contest: updatedContest,
    });
  } catch (error) {
    console.error("Update contest error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const { id } = await params;

    const contest = await prisma.contest.findUnique({
      where: { id },
    });

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }

    // SQLite doesn't support cascade delete, so delete submissions manually
    await prisma.submission.deleteMany({
      where: { contestId: id },
    });
    await prisma.submissionQuotaWindow.deleteMany({
      where: { contestId: id },
    });

    await prisma.contest.delete({
      where: { id },
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("Delete contest error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
