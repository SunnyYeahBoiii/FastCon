import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = await params;

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
    return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, username, role } = body;

    const updateData: { name?: string; username?: string; role?: string } = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (role) updateData.role = role;

    if (username) {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });
      if (existingUser && existingUser.id !== id) {
        return NextResponse.json(
          { error: "Tên tài khoản đã tồn tại" },
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
      { error: "Lỗi khi cập nhật người dùng" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    await prisma.submission.deleteMany({
      where: { userId: id },
    });

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Lỗi khi xóa người dùng" },
      { status: 500 }
    );
  }
}
