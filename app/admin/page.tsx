import { prisma } from "@/lib/db";
import { Trophy, Users, FileCode } from "lucide-react";

async function getStats() {
  const contestCount = await prisma.contest.count();
  const userCount = await prisma.user.count();
  const pendingSubmissions = await prisma.submission.count({
    where: { status: "uploaded" },
  });

  return { contestCount, userCount, pendingSubmissions };
}

async function getRecentContests() {
  const contests = await prisma.contest.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { submissions: true },
      },
    },
  });
  return contests;
}

export default async function AdminDashboard() {
  const stats = await getStats();
  const recentContests = await getRecentContests();

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
            Trung tâm Quản trị
          </h1>
          <p className="text-on-surface-variant">
            Tổng quan và quản lý nền tảng thi đấu.
          </p>
        </div>
        <button
          className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-2.5 rounded-xl font-medium shadow-sm hover:shadow-lg transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Cuộc thi mới
        </button>
      </header>

      {/* Quick Stats Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Total Contests */}
        <div className="bg-surface-container-lowest rounded-xl p-6 relative group overflow-hidden shadow-[0_4px_24px_rgba(25,28,30,0.04)]">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors duration-500"></div>
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-on-surface mb-1">{stats.contestCount}</div>
          <div className="text-sm text-on-surface-variant">Tổng số cuộc thi</div>
          <div className="text-xs text-primary mt-2">+3 tháng này</div>
        </div>

        {/* Active Users */}
        <div className="bg-surface-container-lowest rounded-xl p-6 relative group overflow-hidden shadow-[0_4px_24px_rgba(25,28,30,0.04)]">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-secondary-container/30 rounded-full blur-2xl group-hover:bg-secondary-container/50 transition-colors duration-500"></div>
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-on-surface mb-1">{stats.userCount.toLocaleString()}</div>
          <div className="text-sm text-on-surface-variant">Người dùng hoạt động</div>
          <div className="text-xs text-secondary mt-2">+124 tuần này</div>
        </div>

        {/* Pending Submissions */}
        <div className="bg-surface-container-lowest rounded-xl p-6 relative group overflow-hidden shadow-[0_4px_24px_rgba(25,28,30,0.04)]">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-error-container/30 rounded-full blur-2xl group-hover:bg-error-container/50 transition-colors duration-500"></div>
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-error">
              <FileCode className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-on-surface mb-1">{stats.pendingSubmissions}</div>
          <div className="text-sm text-on-surface-variant">Bài nộp đang chờ</div>
          <div className="text-xs text-error mt-2">Cần xem xét</div>
        </div>
      </div>

      {/* Recent Contests Section */}
      <section>
        <h2 className="text-xl font-semibold text-on-surface mb-6">Các cuộc thi gần đây</h2>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
          <div className="divide-y divide-outline-variant/10">
            {recentContests.map((contest) => (
              <div
                key={contest.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-surface-container-low/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  {/* Date Badge */}
                  <div className="bg-surface-container text-on-surface-variant px-3 py-1.5 rounded text-xs font-medium">
                    {new Date(contest.createdAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                  <div>
                    <h3 className="font-medium text-on-surface">{contest.title}</h3>
                    <p className="text-sm text-on-surface-variant">{contest.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Status Chip */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      contest.status === "ongoing"
                        ? "bg-secondary-container text-on-secondary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    {contest.status === "ongoing" ? "Đang hoạt động" : "Đã hoàn thành"}
                  </span>
                  {/* Participant Count */}
                  <span className="text-sm text-on-surface-variant">
                    {contest._count.submissions} bài nộp
                  </span>
                  {/* Hover Actions */}
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded transition-colors">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded transition-colors">
                      <span className="material-symbols-outlined text-lg">settings</span>
                    </button>
                    <button className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/50 rounded transition-colors">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}