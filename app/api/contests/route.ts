import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const contests = await prisma.contest.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      contests,
    });
  } catch (error) {
    console.error("Fetch contests error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, code, description, deadline, status, dailySubmissionLimit } = body;

    if (!title || !code) {
      return NextResponse.json(
        { ok: false, error: "Title and code are required" },
        { status: 400 }
      );
    }

    const existingContest = await prisma.contest.findUnique({
      where: { code },
    });

    if (existingContest) {
      return NextResponse.json(
        { ok: false, error: "Contest code already exists" },
        { status: 400 }
      );
    }

    const contest = await prisma.contest.create({
      data: {
        title,
        code,
        description: description || null,
        deadline: deadline ? new Date(deadline) : null,
        status: status || "ongoing",
        dailySubmissionLimit: dailySubmissionLimit ? parseInt(dailySubmissionLimit) : null,
      },
    });

    return NextResponse.json({
      ok: true,
      contest,
    });
  } catch (error) {
    console.error("Create contest error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}