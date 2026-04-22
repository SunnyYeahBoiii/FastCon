import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/guard";
import { parseDailySubmissionLimit } from "./validation";

export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

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
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const body = await request.json();
    const { title, description, deadline, status, dailySubmissionLimit } = body;
    const parsedLimit = parseDailySubmissionLimit(dailySubmissionLimit);

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "Title is required" },
        { status: 400 }
      );
    }
    if (!parsedLimit.ok) {
      return NextResponse.json(
        { ok: false, error: parsedLimit.error },
        { status: 400 }
      );
    }

    const contest = await prisma.contest.create({
      data: {
        title,
        description: description || null,
        deadline: deadline
          ? (() => {
              const [date, time] = deadline.split("T");
              const [y, m, d] = date.split("-").map(Number);
              const [h, min] = time.split(":").map(Number);
              return new Date(Date.UTC(y, m - 1, d, h, min));
            })()
          : null,
        status: status || "ongoing",
        dailySubmissionLimit: parsedLimit.value ?? null,
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
