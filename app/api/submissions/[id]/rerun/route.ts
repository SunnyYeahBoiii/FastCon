import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/guard";
import { processQueue } from "@/lib/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const submission = await prisma.submission.findUnique({ where: { id } });

  if (!submission) {
    return NextResponse.json(
      { ok: false, error: "Submission not found" },
      { status: 404 }
    );
  }

  await prisma.submission.update({
    where: { id },
    data: { status: "queued", score: null, metrics: null },
  });

  processQueue().catch((err) => {
    console.error("Rerun queue error:", err);
  });

  return NextResponse.json({ ok: true });
}
