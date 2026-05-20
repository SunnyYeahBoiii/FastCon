import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "./db";

export async function requireAdminApi() {
  const cookieStore = cookies();
  const sessionId = cookieStore.get("session")?.value;
  if (!sessionId)
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let user;
  try {
    user = await prisma.user.findUnique({ where: { id: sessionId } });
  } catch (error) {
    console.error("Admin guard error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }

  if (!user || user.role !== "admin")
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return user;
}
