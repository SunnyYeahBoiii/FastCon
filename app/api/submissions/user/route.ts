import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Returns submissions for a specific user (no admin required)
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const submissions = await prisma.submission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        status: true,
        score: true,
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
