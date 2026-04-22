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
  const contest = await prisma.contest.findUnique({
    where: { id },
    select: { evaluateCode: true },
  });

  if (!contest) {
    return NextResponse.json(
      { ok: false, error: "Contest not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    evaluateCode: contest.evaluateCode,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const body = await request.json();
  const { evaluateCode } = body;

  const contest = await prisma.contest.update({
    where: { id },
    data: {
      evaluateCode: evaluateCode ?? null,
    },
  });

  return NextResponse.json({ ok: true, contest });
}
