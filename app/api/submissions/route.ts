import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { runJudge } from "@/lib/judge";
import { requireAdminApi } from "@/lib/guard";

export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const submissions = await prisma.submission.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, username: true },
        },
        contest: {
          select: { id: true, title: true },
        },
      },
    });
    return NextResponse.json({ submissions });
  } catch (error) {
    console.error("Fetch submissions error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const contestId = formData.get("contestId") as string | null;
    const userId = formData.get("userId") as string | null;

    if (!file || !contestId || !userId) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate .pkl extension
    const filename = file.name;
    if (!filename.endsWith(".pkl")) {
      return NextResponse.json(
        { ok: false, error: "File must be a .pkl file" },
        { status: 400 }
      );
    }

    // Get upload directory from env
    const uploadDir = process.env.UPLOAD_DIR || "./storage/submissions";

    // Ensure upload directory exists
    await mkdir(uploadDir, { recursive: true });

    // Generate timestamp prefix for filename
    const timestamp = Date.now();
    const savedFilename = `${timestamp}_${filename}`;
    const filepath = path.join(uploadDir, savedFilename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Create submission record
    const submission = await prisma.submission.create({
      data: {
        userId,
        contestId,
        filename: savedFilename,
        filepath,
        status: "uploaded",
      },
    });

    // Fire-and-forget judge call
    runJudge(submission.id).catch((err) => {
      console.error("Judge error:", err);
    });

    return NextResponse.json({
      ok: true,
      submissionId: submission.id,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}