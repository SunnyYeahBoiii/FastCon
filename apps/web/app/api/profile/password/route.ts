import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function PUT(request: Request) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "JSON không hợp lệ" },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const currentPassword =
      typeof input.currentPassword === "string" ? input.currentPassword : "";
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập đầy đủ thông tin" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const isCurrentPasswordValid = await verifyPassword(
      currentPassword,
      user.passwordHash
    );

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { ok: false, error: "Mật khẩu hiện tại không đúng" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Change profile password error:", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi đổi mật khẩu" },
      { status: 500 }
    );
  }
}
