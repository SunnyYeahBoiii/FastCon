import { requireAuth } from "@/lib/requireAuth";
import { getSerializedContestsForSubmitPicker } from "@/lib/contests";
import ClientPage from "./ClientPage";

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ contestId?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const initialContests = await getSerializedContestsForSubmitPicker();

  return (
    <ClientPage
      initialContests={initialContests}
      initialContestId={params.contestId ?? null}
    />
  );
}
