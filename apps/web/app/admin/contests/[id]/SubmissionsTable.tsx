"use client";

import { useEffect, useState } from "react";
import { formatHoChiMinhDateTime } from "@/lib/timeZone";

declare const process: {
  env: {
    NEXT_PUBLIC_FASTAPI_PUBLIC_URL?: string;
  };
};

interface Submission {
  id: string;
  filename: string;
  score: number | null;
  metrics: string | null;
  status: string;
  createdAt: string;
  user: {
    name: string;
  };
}

interface SubmissionsTableProps {
  submissions: Submission[];
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_PUBLIC_URL?.replace(/\/$/, "") || "/cs116.khtn";
const PAGE_SIZE = 10;
const MAX_VISIBLE_PAGES = 7;

function generatePaginationItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis")[] = [];
  items.push(1);

  if (current > 3) {
    items.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    items.push(i);
  }

  if (current < total - 2) {
    items.push("ellipsis");
  }

  items.push(total);
  return items;
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function formatDate(dateStr: string) {
  return formatHoChiMinhDateTime(dateStr);
}

export default function SubmissionsTable({ submissions }: SubmissionsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [liveSubmissions, setLiveSubmissions] = useState(submissions);
  const selectedSubmissionId = selectedSubmission?.id;
  const totalPages = Math.max(1, Math.ceil(liveSubmissions.length / PAGE_SIZE));

  const paginatedSubmissions = liveSubmissions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setLiveSubmissions(submissions);
  }, [submissions]);

  useEffect(() => {
    if (!selectedSubmissionId) {
      return;
    }

    const nextSelectedSubmission = liveSubmissions.find(
      (submission) => submission.id === selectedSubmissionId
    );
    if (nextSelectedSubmission) {
      setSelectedSubmission(nextSelectedSubmission);
    }
  }, [liveSubmissions, selectedSubmissionId]);

  useEffect(() => {
    const eventSource = new globalThis.EventSource(apiUrl("/api/submissions/stream?scope=admin"), {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "initial" && data.type !== "update") {
          return;
        }

        const nextSubmissions = Array.isArray(data.submissions) ? data.submissions : [];
        setLiveSubmissions(nextSubmissions);
        setCurrentPage((page) =>
          Math.min(page, Math.max(1, Math.ceil(nextSubmissions.length / PAGE_SIZE)))
        );
      } catch (error) {
        console.error("Admin submission stream event error:", error);
      }
    };

    return () => eventSource.close();
  }, []);

  const formatStatus = (status: string) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      queued: { label: "Đang chờ", class: "bg-surface-container-highest text-on-surface-variant" },
      running: { label: "Đang chấm", class: "bg-tertiary-container text-on-tertiary animate-pulse" },
      uploaded: { label: "Đã nộp", class: "bg-surface-container-highest text-on-surface-variant" },
      pending: { label: "Chờ xử lý", class: "bg-tertiary-container text-on-tertiary" },
      graded: { label: "Đã chấm", class: "bg-secondary-container text-on-secondary" },
      failed: { label: "Lỗi", class: "bg-error-container text-on-error" },
      error: { label: "Lỗi", class: "bg-error-container text-on-error" },
    };
    return statusMap[status] || { label: status, class: "bg-surface-container-highest text-on-surface-variant" };
  };

const getErrorInfo = (metrics: string | null): { error: string | null; metrics: Record<string, unknown> | null } => {
    if (!metrics) return { error: null, metrics: null };
    try {
      const parsed = JSON.parse(metrics);
      const { error, traceback, ...rest } = parsed;
      return { error: error || null, metrics: Object.keys(rest).length > 0 ? rest : null };
    } catch {
      return { error: null, metrics: null };
    }
  };

  if (liveSubmissions.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6">
        <h2 className="text-lg font-bold text-on-surface mb-4">
          <span className="material-symbols-outlined inline-block mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>
            assignment
          </span>
          Bài nộp
        </h2>
        <div className="text-sm text-on-surface-variant py-8 text-center">
          Chưa có bài nộp nào
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
        <div className="p-6 border-b border-outline-variant/15">
          <h2 className="text-lg font-bold text-on-surface">
            <span className="material-symbols-outlined inline-block mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>
              assignment
            </span>
            Bài nộp ({liveSubmissions.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-semibold text-sm border-b border-outline-variant/15">
              <th className="py-4 px-6 font-medium">Tên người nộp</th>
              <th className="py-4 px-6 font-medium">File</th>
              <th className="py-4 px-6 font-medium">Điểm</th>
              <th className="py-4 px-6 font-medium">Trạng thái</th>
              <th className="py-4 px-6 font-medium">Thời gian</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-outline-variant/10">
            {paginatedSubmissions.map((submission) => {
              const statusInfo = formatStatus(submission.status);
              const { error } = getErrorInfo(submission.metrics);
              return (
                <tr key={submission.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-6 text-on-surface font-medium">{submission.user.name}</td>
                  <td className="py-4 px-6 text-on-surface-variant">{submission.filename}</td>
                  <td className="py-4 px-6">
                    {submission.score !== null ? (
                      <span className="text-on-surface font-semibold">{submission.score.toFixed(2)}</span>
                    ) : (
                      <span className="text-on-surface-variant">-</span>
                    )}
                    {submission.metrics && submission.score !== null && (() => {
                      try {
                        const m = JSON.parse(submission.metrics);
                        const keys = Object.keys(m).filter(k => k !== 'error' && k !== 'traceback');
                        if (keys.length === 0) return null;
                        return (
                          <div className="text-xs text-on-surface-variant mt-1">
                            {keys.map(k => `${k}: ${m[k]}`).join(', ')}
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                  </td>
                  <td className="py-4 px-6">
                    <button
                      onClick={() => setSelectedSubmission(submission)}
                      className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${statusInfo.class}`}
                      title={error ? `Lỗi: ${error}` : undefined}
                    >
                      {statusInfo.label}
                    </button>
                  </td>
                  <td className="py-4 px-6 text-on-surface-variant">{formatDate(submission.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        <div className="bg-surface-container-lowest px-6 py-4 flex items-center justify-between border-t border-outline-variant/15">
          <span className="text-sm text-on-surface-variant">
            Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, liveSubmissions.length)} của {liveSubmissions.length} bài nộp
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {generatePaginationItems(currentPage, totalPages).map((item, idx) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="w-8 h-8 flex items-center justify-center text-on-surface-variant text-sm"
                >
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setCurrentPage(item)}
                  className={`w-8 h-8 flex items-center justify-center rounded font-medium ${
                    item === currentPage
                      ? "bg-primary text-on-primary"
                      : "hover:bg-surface-container-high transition-colors text-on-surface-variant"
                  }`}
                >
                  {item}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedSubmission && <SubmissionDetailModal submission={selectedSubmission} onClose={() => setSelectedSubmission(null)} />}
    </>
  );
}

function SubmissionDetailModal({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const { error, metrics } = getErrorInfo(submission.metrics);
  const statusInfo = formatStatus(submission.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-on-surface">Chi tiết bài nộp</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">Người nộp</span>
            <span className="text-on-surface font-medium text-right">{submission.user.name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">File</span>
            <span className="text-on-surface-variant text-right break-all">{submission.filename}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Trạng thái</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.class}`}>
              {statusInfo.label}
            </span>
          </div>
          {submission.score !== null && (
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Điểm</span>
              <span className="text-on-surface font-bold">{submission.score.toFixed(2)}</span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 p-3 bg-error-container/30 border border-error-container rounded-lg">
              <div className="text-on-error font-semibold mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                Lỗi chấm bài
              </div>
              <pre className="text-xs text-on-surface font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {error}
              </pre>
            </div>
          )}

          {/* Metrics display */}
          {metrics && (
            <div className="mt-4 p-3 bg-surface-container rounded-lg">
              <div className="text-on-surface font-semibold mb-2">Metrics</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(metrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-on-surface-variant">{key}</span>
                    <span className="text-on-surface font-mono">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-on-surface-variant pt-2">
            Nộp lúc: {formatDate(submission.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatStatus(status: string) {
  const statusMap: Record<string, { label: string; class: string }> = {
    uploading: { label: "Đang tải lên", class: "bg-surface-container-highest text-on-surface-variant" },
    queued: { label: "Đang chờ", class: "bg-surface-container-highest text-on-surface-variant" },
    running: { label: "Đang chấm", class: "bg-tertiary-container text-on-tertiary animate-pulse" },
    uploaded: { label: "Đã nộp", class: "bg-surface-container-highest text-on-surface-variant" },
    pending: { label: "Chờ xử lý", class: "bg-tertiary-container text-on-tertiary" },
    graded: { label: "Đã chấm", class: "bg-secondary-container text-on-secondary" },
    failed: { label: "Lỗi", class: "bg-error-container text-on-error" },
    error: { label: "Lỗi", class: "bg-error-container text-on-error" },
  };
  return statusMap[status] || { label: status, class: "bg-surface-container-highest text-on-surface-variant" };
}

function getErrorInfo(metrics: string | null): { error: string | null; metrics: Record<string, unknown> | null } {
  if (!metrics) return { error: null, metrics: null };
  try {
    const parsed = JSON.parse(metrics);
    const { error, traceback, ...rest } = parsed;
    return { error: error || null, metrics: Object.keys(rest).length > 0 ? rest : null };
  } catch {
    return { error: null, metrics: null };
  }
}
