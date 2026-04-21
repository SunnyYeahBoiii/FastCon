import { requireAuth } from "@/lib/requireAuth";
import ClientPage from "./ClientPage";

export default async function SubmitPage() {
  const user = await requireAuth();
  return <ClientPage userId={user.id} />;
}
