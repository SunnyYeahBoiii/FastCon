import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// Returns submissions for a specific user (no admin required)
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedUserId = request.nextUrl.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = currentUser.id;

    const submissions = await prisma.submission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        status: true,
        score: true,
        metrics: true,
        createdAt: true,
        contest: {
          select: { id: true, title: true },
        },
      },
    });

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error("Fetch user submissions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
