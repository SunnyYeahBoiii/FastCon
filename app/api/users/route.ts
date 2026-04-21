import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/guard";

export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const body = await request.json();
    const { name, username, password, role } = body;

    if (!name || !username || !password) {
      return NextResponse.json(
        { error: "Thiếu thông tin cần thiết" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Tên tài khoản đã tồn tại" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        username,
        passwordHash,
        role: role || "contestant",
      },
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
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Lỗi khi tạo người dùng" },
      { status: 500 }
    );
  }
}
