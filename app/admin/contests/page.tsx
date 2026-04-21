import { requireAdmin } from "@/lib/requireAuth";
import ClientPage from "./ClientPage";

export default async function ContestsPage() {
  await requireAdmin();
  return <ClientPage />;
}
