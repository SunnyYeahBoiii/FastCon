import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeFile } from "fs/promises";
import { join } from "path";

export async function POST(
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Create filename with contest code prefix
    const filename = `${id}_${file.name}`;
    const filepath = join(process.cwd(), "storage", "testdata", filename);

    // Save file to storage/testdata
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Update contest's groundTruthPath
    const updatedContest = await prisma.contest.update({
      where: { id },
      data: {
        groundTruthPath: filepath,
      },
    });

    return NextResponse.json({
      ok: true,
      path: filepath,
    });
  } catch (error) {
    console.error("Upload ground truth error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}