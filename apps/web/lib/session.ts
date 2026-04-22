import { cookies } from "next/headers";
import { prisma } from "./db";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  if (!sessionId) return null;
  return prisma.user.findUnique({ where: { id: sessionId } });
}
