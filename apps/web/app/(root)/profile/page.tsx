import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

const statusColors: Record<string, string> = {
  uploaded: "bg-surface-container-highest text-on-surface-variant",
  queued: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  running: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  graded: "bg-green-500/20 text-green-600 dark:text-green-400",
  failed: "bg-red-500/20 text-red-600 dark:text-red-400",
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const submissions = await prisma.submission.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      contest: { select: { id: true, title: true } },
    },
  });

  const formatDate = (date: Date) =>
    date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="mb-8 bg-surface-container-lowest rounded-xl shadow p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-on-primary text-2xl font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{user.name}</h1>
            <p className="text-on-surface-variant">@{user.username}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="bg-surface-container-highest rounded-lg p-4">
            <div className="text-2xl font-bold text-on-surface">
              {submissions.length}
            </div>
            <div className="text-sm text-on-surface-variant">Tổng bài nộp</div>
          </div>
          <div className="bg-surface-container-highest rounded-lg p-4">
            <div className="text-2xl font-bold text-green-500">
              {submissions.filter((s) => s.status === "graded").length}
            </div>
            <div className="text-sm text-on-surface-variant">Đã chấm</div>
          </div>
          <div className="bg-surface-container-highest rounded-lg p-4">
            <div className="text-2xl font-bold text-on-surface">
              {submissions.filter((s) => s.status === "graded").length > 0
                ? (
                    submissions
                      .filter((s) => s.score != null)
                      .reduce((acc, s) => acc + (s.score ?? 0), 0) /
                    Math.max(
                      submissions.filter((s) => s.score != null).length,
                      1
                    )
                  ).toFixed(1)
                : "—"}
            </div>
            <div className="text-sm text-on-surface-variant">Điểm trung bình</div>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow overflow-hidden">
        <h2 className="text-lg font-semibold text-on-surface px-6 pt-5 pb-3">
          Lịch sử nộp bài
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant font-semibold text-sm border-b border-outline-variant/15">
                <th className="py-3 px-6">File</th>
                <th className="py-3 px-6">Cuộc thi</th>
                <th className="py-3 px-6">Trạng thái</th>
                <th className="py-3 px-6 text-right">Điểm</th>
                <th className="py-3 px-6 text-right">Thời gian</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-outline-variant/10">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-6 text-center text-on-surface-variant">
                    Chưa có bài nộp nào
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3 px-6">
                      <span className="font-medium text-on-surface">{sub.filename}</span>
                    </td>
                    <td className="py-3 px-6">
                      <Link
                        href={`/contests/${sub.contest.id}`}
                        className="text-primary hover:underline"
                      >
                        {sub.contest.title}
                      </Link>
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          statusColors[sub.status] ??
                          "bg-surface-container-highest text-on-surface-variant"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <span className="font-medium text-on-surface">
                        {sub.score != null ? sub.score.toFixed(2) : "—"}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right text-on-surface-variant">
                      {formatDate(new Date(sub.createdAt))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
