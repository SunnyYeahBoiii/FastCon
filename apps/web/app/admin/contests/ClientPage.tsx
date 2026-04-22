"use client";

import { Search, Edit, Trash2, Plus, X, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Contest {
  id: string;
  title: string;
  description: string | null;
  groundTruthPath: string | null;
  deadline: string | null;
  status: string;
  dailySubmissionLimit: number | null;
  createdAt: string;
  _count?: {
    submissions: number;
  };
}

interface ContestFormData {
  title: string;
  description: string;
  deadline: string;
  dailySubmissionLimit: string;
  status: string;
}

export default function ContestsPage() {
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<ContestFormData>({
    title: "",
    description: "",
    deadline: "",
    dailySubmissionLimit: "",
    status: "ongoing",
  });
  const [groundTruthFile, setGroundTruthFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    try {
      const response = await fetch("/api/contests");
      const data = await response.json();
      if (data.ok) {
        setContests(data.contests);
      }
    } catch (error) {
      console.error("Fetch contests error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredContests = contests.filter((contest) =>
    contest.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateContest = async () => {
    if (!formData.title) {
      alert("Vui lòng nhập tiêu đề");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.ok) {
        // Upload ground truth file if provided
        if (groundTruthFile && data.contest.id) {
          const gtFormData = new FormData();
          gtFormData.append("file", groundTruthFile);
          await fetch(`/api/contests/${data.contest.id}/ground-truth`, {
            method: "POST",
            body: gtFormData,
          });
        }
        setShowModal(false);
        setFormData({
          title: "",
          description: "",
          deadline: "",
          dailySubmissionLimit: "",
          status: "ongoing",
        });
        setGroundTruthFile(null);
        fetchContests();
      } else {
        alert(data.error || "Không thể tạo cuộc thi");
      }
    } catch (error) {
      console.error("Create contest error:", error);
      alert("Không thể tạo cuộc thi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContest = async (id: string, title: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa cuộc thi "${title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/contests/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.ok) {
        fetchContests();
      } else {
        alert(data.error || "Không thể xóa cuộc thi");
      }
    } catch (error) {
      console.error("Delete contest error:", error);
      alert("Không thể xóa cuộc thi");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Không có hạn";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN");
  };

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
          onClick={() => setShowModal(true)}
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              <th className="py-4 px-6 font-medium">Trạng thái</th>
              <th className="py-4 px-6 font-medium text-right">Bài nộp</th>
              <th className="py-4 px-6 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-outline-variant/10">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 px-6 text-center text-on-surface-variant">
                  Đang tải...
                </td>
              </tr>
            ) : filteredContests.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 px-6 text-center text-on-surface-variant">
                  Không tìm thấy cuộc thi
                </td>
              </tr>
            ) : (
              filteredContests.map((contest) => (
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
                          {formatDate(contest.deadline)}
                        </div>
                      </div>
                    </div>
                  </td>
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
                    <span className="text-on-surface font-medium">{contest._count?.submissions || 0}</span>
                    <span className="text-xs text-on-surface-variant ml-1">bài</span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => router.push(`/admin/contests/${contest.id}`)}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded hover:bg-surface-container-high"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteContest(contest.id, contest.title)}
                        className="p-2 text-on-surface-variant hover:text-error transition-colors rounded hover:bg-error-container/50"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="bg-surface-container-lowest px-6 py-4 flex items-center justify-between border-t border-outline-variant/15">
          <span className="text-sm text-on-surface-variant">
            Hiển thị {filteredContests.length > 0 ? 1 : 0}-{filteredContests.length} của {contests.length} cuộc thi
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

      {/* Create Contest Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-container-lowest rounded-xl shadow-lg w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-on-surface">Cuộc thi mới</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-on-surface-variant hover:text-on-surface transition-colors rounded hover:bg-surface-container-high"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateContest(); }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1">
                    Tiêu đề
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1">
                    Mô tả
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1">
                    Hạn chót
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1">
                    Giới hạn nộp bài trong 24 giờ từ lần nộp đầu tiên
                  </label>
                  <input
                    type="number"
                    value={formData.dailySubmissionLimit}
                    onChange={(e) => setFormData({ ...formData, dailySubmissionLimit: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1">
                    Trạng thái
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                  >
                    <option value="ongoing">Đang hoạt động</option>
                    <option value="completed">Đã hoàn thành</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1">
                    File đáp án (.pkl)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pkl"
                      onChange={(e) => setGroundTruthFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="ground-truth-input"
                    />
                    <label
                      htmlFor="ground-truth-input"
                      className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      {groundTruthFile ? groundTruthFile.name : "Chọn file"}
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-surface-container-highest rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {submitting ? "Đang tạo..." : "Tạo cuộc thi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
