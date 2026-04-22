import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Public endpoint — returns active contests for contestants
export async function GET() {
  try {
    const contests = await prisma.contest.findMany({
      where: { status: "ongoing" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        deadline: true,
        status: true,
        dailySubmissionLimit: true,
      },
    });
    return NextResponse.json({ contests });
  } catch (error) {
    console.error("Fetch public contests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
