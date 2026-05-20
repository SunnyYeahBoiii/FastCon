import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/guard";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = params;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "JSON không hợp lệ" },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Mật khẩu phải có ít nhất 6 ký tự" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update password error:", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi cập nhật mật khẩu" },
      { status: 500 }
    );
  }
}
