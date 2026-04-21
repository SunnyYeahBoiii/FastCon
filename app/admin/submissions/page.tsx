import { requireAdmin } from "@/lib/requireAuth";
import ClientPage from "./ClientPage";

export default async function SubmissionsPage() {
  await requireAdmin();
  return <ClientPage />;
}
