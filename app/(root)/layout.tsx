import { getSessionUser } from "@/lib/session";
import ContestantLayout from "@/components/ContestantLayout";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  return (
    <ContestantLayout user={user}>
      {children}
    </ContestantLayout>
  );
}
