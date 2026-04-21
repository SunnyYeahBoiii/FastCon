import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "./db";

export async function requireAdminApi() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  if (!sessionId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: sessionId } });
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return user;
}
