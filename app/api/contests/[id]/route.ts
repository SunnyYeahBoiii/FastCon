import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, code, description, deadline, status, dailySubmissionLimit } = body;

    const contest = await prisma.contest.findUnique({
      where: { id },
    });

    if (!contest) {
      return NextResponse.json(
        { ok: false, error: "Contest not found" },
        { status: 404 }
      );
    }

    if (code && code !== contest.code) {
      const existingContest = await prisma.contest.findUnique({
        where: { code },
      });

      if (existingContest) {
        return NextResponse.json(
          { ok: false, error: "Contest code already exists" },
          { status: 400 }
        );
      }
    }

    const updatedContest = await prisma.contest.update({
      where: { id },
      data: {
        title: title ?? contest.title,
        code: code ?? contest.code,
        description: description ?? contest.description,
        deadline: deadline ? new Date(deadline) : contest.deadline,
        status: status ?? contest.status,
        dailySubmissionLimit: dailySubmissionLimit ? parseInt(dailySubmissionLimit) : contest.dailySubmissionLimit,
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