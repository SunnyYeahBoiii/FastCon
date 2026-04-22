import { requireAuth } from "@/lib/requireAuth";
import ClientPage from "./ClientPage";

export default async function SubmitPage() {
  await requireAuth();
  return <ClientPage />;
}
