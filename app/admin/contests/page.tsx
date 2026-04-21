import { prisma } from "@/lib/db";
import { Search, Edit, Trash2, Plus, Settings } from "lucide-react";

async function getContests() {
  const contests = await prisma.contest.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { submissions: true },
      },
    },
  });
  return contests;
}

export default async function ContestsPage() {
  const contests = await getContests();

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
            Quản lý cuộc thi
          </h1>
          <p className="text-on-surface-variant font-medium">
            Tạo, chỉnh sửa và quản lý các cuộc thi.
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-semibold text-sm hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4" />
          Cuộc thi mới
        </button>
      </header>

      {/* Search */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Tìm kiếm cuộc thi..."
            className="pl-10 pr-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors w-64 text-sm text-on-surface placeholder-on-surface-variant"
          />
        </div>
      </div>

      {/* Contests Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-semibold text-sm border-b border-outline-variant/15">
              <th className="py-4 px-6 font-medium">Cuộc thi</th>
              <th className="py-4 px-6 font-medium">Mã</th>
              <th className="py-4 px-6 font-medium">Trạng thái</th>
              <th className="py-4 px-6 font-medium text-right">Bài nộp</th>
              <th className="py-4 px-6 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-outline-variant/10">
            {contests.map((contest) => (
              <tr key={contest.id} className="hover:bg-surface-container-low/50 transition-colors group">
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                        event_note
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-on-surface">{contest.title}</div>
                      <div className="text-xs text-on-surface-variant">
                        {contest.deadline
                          ? `Hạn: ${contest.deadline.toLocaleDateString("vi-VN")}`
                          : "Không có hạn"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6 text-on-surface-variant font-medium">{contest.code}</td>
                <td className="py-4 px-6">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      contest.status === "ongoing"
                        ? "bg-secondary-container text-on-secondary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    {contest.status === "ongoing" ? "Đang hoạt động" : "Đã hoàn thành"}
                  </span>
                </td>
                <td className="py-4 px-6 text-right">
                  <span className="text-on-surface font-medium">{contest._count.submissions}</span>
                  <span className="text-xs text-on-surface-variant ml-1">bài</span>
                </td>
                <td className="py-4 px-6 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded hover:bg-surface-container-high">
                      <Edit className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded hover:bg-surface-container-high">
                      <Settings className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-on-surface-variant hover:text-error transition-colors rounded hover:bg-error-container/50">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="bg-surface-container-lowest px-6 py-4 flex items-center justify-between border-t border-outline-variant/15">
          <span className="text-sm text-on-surface-variant">
            Hiển thị 1-{contests.length} của {contests.length} cuộc thi
          </span>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-on-primary font-medium">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}