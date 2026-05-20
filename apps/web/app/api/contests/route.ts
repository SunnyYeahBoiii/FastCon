import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/guard";
import { parseContestDeadline, parseDailySubmissionLimit } from "./validation";

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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const description =
      typeof input.description === "string" ? input.description : "";
    const status = typeof input.status === "string" ? input.status : "ongoing";
    const parsedLimit = parseDailySubmissionLimit(input.dailySubmissionLimit);
    const parsedDeadline = parseContestDeadline(input.deadline);

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
    if (!parsedDeadline.ok) {
      return NextResponse.json(
        { ok: false, error: parsedDeadline.error },
        { status: 400 }
      );
    }

    const contest = await prisma.contest.create({
      data: {
        title,
        description: description || null,
        deadline: parsedDeadline.value ?? null,
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
