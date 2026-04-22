"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";

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
  metrics: string | null;
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

interface SubmissionDetail {
  id: string;
  filename: string;
  status: string;
  score: number | null;
  metrics: string | null;
  createdAt: string;
  user: { name: string; username: string };
  contest: { title: string };
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
  if (score >= 90) return { bg: "bg-green-500/20", text: "text-green-400" };
  if (score >= 70) return { bg: "bg-blue-500/20", text: "text-blue-400" };
  if (score >= 50) return { bg: "bg-yellow-500/20", text: "text-yellow-400" };
  return { bg: "bg-error-container", text: "text-error" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function getErrorInfo(metrics: string | null) {
  if (!metrics) return { error: null, rest: null };
  try {
    const parsed = JSON.parse(metrics);
    const { error, traceback, ...rest } = parsed;
    return { error: error || null, rest: Object.keys(rest).length > 0 ? rest : null };
  } catch {
    return { error: null, rest: null };
  }
}

const QUEUED_STATUS = {
  label: "Đang chờ",
  class: "bg-surface-container-highest text-on-surface-variant",
};

const statusMap: Record<string, { label: string; class: string }> = {
  queued: QUEUED_STATUS,
  running: { label: "Đang chấm", class: "bg-tertiary-container text-on-tertiary animate-pulse" },
  graded: { label: "Đã chấm", class: "bg-secondary-container text-on-secondary" },
  failed: { label: "Lỗi", class: "bg-error-container text-on-error" },
  uploaded: { label: "Đã tải lên", class: "bg-surface-container-highest text-on-surface-variant" },
};

function getStatusMeta(status: string) {
  return statusMap[status] ?? QUEUED_STATUS;
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [subRes, usersRes] = await Promise.all([
        fetch("/api/submissions"),
        fetch("/api/users"),
      ]);
      const subData = await subRes.json();
      const usersData = await usersRes.json();
      setSubmissions(subData.submissions || []);
      setUsers(usersData.users || []);
    } catch (e) {
      console.error("Fetch error:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleViewDetail = async (id: string) => {
    const res = await fetch(`/api/submissions/${id}`);
    const data = await res.json();
    if (data.ok) setDetail(data.submission);
  };

  const handleRerun = async (id: string) => {
    setRerunning(id);
    try {
      const res = await fetch(`/api/submissions/${id}/rerun`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        fetchData();
        setDetail(null);
      }
    } catch (e) {
      console.error("Rerun error:", e);
    }
    setRerunning(null);
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchesSearch =
      s.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.contest.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUsername = !selectedUsername || s.user.username === selectedUsername;
    const matchesStatus = !selectedStatus || s.status === selectedStatus;
    return matchesSearch && matchesUsername && matchesStatus;
  });

  const statusOptions = [
    { value: "", label: "Tất cả" },
    { value: "queued", label: "Đang chờ" },
    { value: "running", label: "Đang chấm" },
    { value: "graded", label: "Đã chấm" },
    { value: "failed", label: "Lỗi" },
  ];

  return (
    <div className="p-8">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">Kiểm tra bài nộp</h1>
          <p className="text-on-surface-variant font-medium">Theo dõi và quản lý các bài nộp từ người dự thi.</p>
        </div>
      </header>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text" placeholder="Tìm kiếm bài nộp..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors w-64 text-sm text-on-surface placeholder-on-surface-variant"
          />
        </div>
        <select value={selectedUsername} onChange={(e) => setSelectedUsername(e.target.value)}
          className="px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface">
          <option value="">Tất cả người dùng</option>
          {users.map((u) => (<option key={u.id} value={u.username}>{u.name} ({u.username})</option>))}
        </select>
        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface">
          {statusOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>

      <div className="bg-surface-container-lowest rounded-lg shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container text-on-surface-variant text-sm font-semibold tracking-wide border-b border-surface-container">
              <th className="py-4 px-6 font-medium">Tên người nộp</th>
              <th className="py-4 px-6 font-medium">Cuộc thi</th>
              <th className="py-4 px-6 font-medium text-center">Trạng thái</th>
              <th className="py-4 px-6 font-medium text-right">Số điểm</th>
              <th className="py-4 px-6 font-medium text-right">Thời gian nộp</th>
              <th className="py-4 px-6 font-medium text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container/50">
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">Đang tải...</td></tr>
            ) : filteredSubmissions.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">Không tìm thấy bài nộp</td></tr>
            ) : (
              filteredSubmissions.map((s) => {
                const scoreBadge = getScoreBadge(s.score);
                const st = getStatusMeta(s.status);
                return (
                  <tr key={s.id} className="hover:bg-surface-container-low/30 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs">{getInitials(s.user.name)}</div>
                        <div><div className="font-medium text-on-surface">{s.user.name}</div><div className="text-xs text-on-surface-variant">{s.user.username}</div></div>
                      </div>
                    </td>
                    <td className="py-4 px-6"><span className="text-on-surface font-medium">{s.contest.title}</span></td>
                    <td className="py-4 px-6 text-center"><span className={`px-2 py-1 rounded-full text-xs font-medium ${st.class}`}>{st.label}</span></td>
                    <td className="py-4 px-6 text-right"><span className={`px-2 py-1 rounded text-sm font-medium ${scoreBadge.bg} ${scoreBadge.text}`}>{s.score !== null ? s.score.toFixed(1) : "Chưa chấm"}</span></td>
                    <td className="py-4 px-6 text-right"><div className="flex flex-col items-end"><span className="text-sm text-on-surface">{formatDate(s.createdAt)}</span><span className="text-xs text-on-surface-variant">{formatTime(s.createdAt)}</span></div></td>
                    <td className="py-4 px-6 text-center">
                      <button onClick={() => handleViewDetail(s.id)} className="p-1.5 text-primary hover:bg-surface-container-high rounded-lg transition-colors inline-flex items-center justify-center" title="Xem chi tiết">
                        <Search className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-6 py-4 bg-surface-container-lowest border-t border-surface-container">
          <span className="text-sm text-on-surface-variant">Hiển thị 1 - {filteredSubmissions.length} của {submissions.length} bài nộp</span>
          <div className="flex gap-1">
            <button className="p-1 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"><span className="material-symbols-outlined">chevron_left</span></button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-on-primary text-sm font-medium">1</button>
            <button className="p-1 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"><span className="material-symbols-outlined">chevron_right</span></button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} onRerun={() => handleRerun(detail.id)} rerunning={rerunning === detail.id} />}
    </div>
  );
}

function DetailModal({ detail, onClose, onRerun, rerunning }: {
  detail: SubmissionDetail;
  onClose: () => void;
  onRerun: () => void;
  rerunning: boolean;
}) {
  const st = getStatusMeta(detail.status);
  const { error, rest } = getErrorInfo(detail.metrics);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-on-surface">Chi tiết bài nộp</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-on-surface-variant">Người nộp</span><span className="text-on-surface font-medium">{detail.user.name}</span></div>
          <div className="flex justify-between"><span className="text-on-surface-variant">Cuộc thi</span><span className="text-on-surface font-medium">{detail.contest.title}</span></div>
          <div className="flex justify-between"><span className="text-on-surface-variant">File</span><span className="text-on-surface-variant font-mono text-xs">{detail.filename}</span></div>
          <div className="flex justify-between"><span className="text-on-surface-variant">Trạng thái</span><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.class}`}>{st.label}</span></div>
          {detail.score !== null && (
            <div className="flex justify-between"><span className="text-on-surface-variant">Điểm</span><span className="text-on-surface font-bold">{detail.score.toFixed(2)}</span></div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-error-container/30 border border-error-container rounded-lg">
              <div className="text-on-error font-semibold mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span> Lỗi chấm bài
              </div>
              <pre className="text-xs text-on-surface font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{error}</pre>
            </div>
          )}

          {rest && (
            <div className="mt-4 p-3 bg-surface-container rounded-lg">
              <div className="text-on-surface font-semibold mb-2">Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(rest).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-on-surface-variant">{k}</span>
                    <span className="text-on-surface font-mono">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-on-surface-variant pt-2">Nộp lúc: {formatDate(detail.createdAt)} {formatTime(detail.createdAt)}</div>

          {detail.status === "failed" && (
            <button
              onClick={onRerun}
              disabled={rerunning}
              className="w-full mt-4 px-4 py-2.5 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {rerunning ? "Đang gửi lại..." : "Chấm lại"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
