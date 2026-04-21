"use client";

import { useState, useEffect } from "react";
import { Search, Eye } from "lucide-react";

interface User {
  id: string;
  name: string;
  username: string;
}

interface Submission {
  id: string;
  filename: string;
  status: string;
  score: number | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    username: string;
  };
  contest: {
    id: string;
    title: string;
  };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getScoreBadge(score: number | null): { bg: string; text: string } {
  if (score === null) {
    return { bg: "bg-surface-container-high", text: "text-on-surface-variant" };
  }
  if (score >= 90) {
    return { bg: "bg-green-500/20", text: "text-green-400" };
  }
  if (score >= 70) {
    return { bg: "bg-blue-500/20", text: "text-blue-400" };
  }
  if (score >= 50) {
    return { bg: "bg-yellow-500/20", text: "text-yellow-400" };
  }
  return { bg: "bg-error-container", text: "text-error" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch submissions
        const submissionsRes = await fetch("/api/submissions");
        const submissionsData = await submissionsRes.json();
        setSubmissions(submissionsData.submissions || []);

        // Fetch users for dropdown
        const usersRes = await fetch("/api/users");
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      } catch (error) {
        console.error("Fetch error:", error);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Client-side filtering
  const filteredSubmissions = submissions.filter((submission) => {
    // Search filter
    const matchesSearch =
      submission.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submission.user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submission.contest.title.toLowerCase().includes(searchQuery.toLowerCase());

    // Username filter
    const matchesUsername =
      !selectedUsername || submission.user.username === selectedUsername;

    // Status filter
    const matchesStatus = !selectedStatus || submission.status === selectedStatus;

    return matchesSearch && matchesUsername && matchesStatus;
  });

  const statusOptions = [
    { value: "", label: "Tất cả" },
    { value: "uploaded", label: "Đã tải lên" },
    { value: "graded", label: "Đã chấm" },
    { value: "error", label: "Lỗi" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
            Kiểm tra bài nộp
          </h1>
          <p className="text-on-surface-variant font-medium">
            Theo dõi và quản lý các bài nộp từ người dự thi.
          </p>
        </div>
      </header>

      {/* Search & Filters */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Tìm kiếm bài nộp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors w-64 text-sm text-on-surface placeholder-on-surface-variant"
          />
        </div>

        {/* Username filter */}
        <select
          value={selectedUsername}
          onChange={(e) => setSelectedUsername(e.target.value)}
          className="px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
        >
          <option value="">Tất cả người dùng</option>
          {users.map((user) => (
            <option key={user.id} value={user.username}>
              {user.name} ({user.username})
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Submissions Table */}
      <div className="bg-surface-container-low rounded-lg p-1">
        <div className="bg-surface-container-lowest rounded-lg shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container text-on-surface-variant text-sm font-semibold tracking-wide border-b border-surface-variant/50">
                <th className="py-4 px-6 font-medium">Tên người nộp</th>
                <th className="py-4 px-6 font-medium">Cuộc thi</th>
                <th className="py-4 px-6 font-medium text-right">Số điểm</th>
                <th className="py-4 px-6 font-medium text-right">Thời gian nộp</th>
                <th className="py-4 px-6 font-medium text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                    Đang tải...
                  </td>
                </tr>
              ) : filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                    Không tìm thấy bài nộp
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((submission) => {
                  const scoreBadge = getScoreBadge(submission.score);
                  return (
                    <tr key={submission.id} className="hover:bg-surface-container-low/30 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs">
                            {getInitials(submission.user.name)}
                          </div>
                          <div>
                            <div className="font-medium text-on-surface">{submission.user.name}</div>
                            <div className="text-xs text-on-surface-variant">{submission.user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-on-surface font-medium">{submission.contest.title}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${scoreBadge.bg} ${scoreBadge.text}`}>
                          {submission.score !== null ? submission.score.toFixed(1) : "Chưa chấm"}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-on-surface">
                            {formatDate(submission.createdAt)}
                          </span>
                          <span className="text-xs text-on-surface-variant">{formatTime(submission.createdAt)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button className="p-1.5 text-primary hover:bg-surface-container-high rounded-lg transition-colors inline-flex items-center justify-center" title="Xem chi tiết">
                          <Eye className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 bg-surface-container-lowest border-t border-surface-variant/50">
            <span className="text-sm text-on-surface-variant">
              Hiển thị 1 - {filteredSubmissions.length} của {submissions.length} bài nộp
            </span>
            <div className="flex gap-1">
              <button className="p-1 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant">
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-on-primary text-sm font-medium">
                1
              </button>
              <button className="p-1 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}