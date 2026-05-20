import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/guard";

const USER_ROLES = new Set(["contestant", "judge", "admin"]);

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        createdAt: true,
        submissions: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            filename: true,
            status: true,
            score: true,
            createdAt: true,
            contest: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("Fetch user error:", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi tải người dùng" },
      { status: 500 }
    );
  }
}

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
    const name = optionalString(input.name);
    const username = optionalString(input.username);
    const role = optionalString(input.role);

    const updateData: { name?: string; username?: string; role?: string } = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (role) {
      if (!USER_ROLES.has(role)) {
        return NextResponse.json(
          { ok: false, error: "Vai trò không hợp lệ" },
          { status: 400 }
        );
      }
      updateData.role = role;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Không có thông tin cần cập nhật" },
        { status: 400 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!currentUser) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    if (username) {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });
      if (existingUser && existingUser.id !== id) {
        return NextResponse.json(
          { ok: false, error: "Tên tài khoản đã tồn tại" },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi cập nhật người dùng" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = params;

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!currentUser) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.submission.deleteMany({
        where: { userId: id },
      }),
      prisma.submissionQuotaWindow.deleteMany({
        where: { userId: id },
      }),
      prisma.user.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi xóa người dùng" },
      { status: 500 }
    );
  }
}
