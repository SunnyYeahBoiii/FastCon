import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/guard";

const USER_ROLES = new Set(["contestant", "judge", "admin"]);

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
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
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    console.error("Fetch users error:", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi tải danh sách người dùng" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "JSON không hợp lệ" },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const name = requiredString(input.name);
    const username = requiredString(input.username);
    const password = requiredString(input.password);
    const role = requiredString(input.role) ?? "contestant";

    if (!name || !username || !password) {
      return NextResponse.json(
        { ok: false, error: "Thiếu thông tin cần thiết" },
        { status: 400 }
      );
    }

    if (!USER_ROLES.has(role)) {
      return NextResponse.json(
        { ok: false, error: "Vai trò không hợp lệ" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json(
        { ok: false, error: "Tên tài khoản đã tồn tại" },
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
      { ok: false, error: "Lỗi khi tạo người dùng" },
      { status: 500 }
    );
  }
}
