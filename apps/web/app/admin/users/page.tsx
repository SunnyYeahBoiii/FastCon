import { requireAdmin } from "@/lib/requireAuth";
import ClientPage from "./ClientPage";

export default async function UsersPage() {
  await requireAdmin();
  return <ClientPage />;
}
