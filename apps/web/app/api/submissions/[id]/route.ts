import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, username: true } },
      contest: { select: { id: true, title: true } },
    },
  });

  if (!submission) {
    return NextResponse.json(
      { ok: false, error: "Submission not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, submission });
}
