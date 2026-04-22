import { redirect } from "next/navigation";
import { getSessionUser } from "./session";

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/");
  return user;
}
