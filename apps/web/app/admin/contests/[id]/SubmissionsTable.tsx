"use client";

import { useState } from "react";

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SubmissionsTable({ submissions }: SubmissionsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const pageSize = 10;
  const totalPages = Math.ceil(submissions.length / pageSize);

  const paginatedSubmissions = submissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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

  if (submissions.length === 0) {
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
            Bài nộp ({submissions.length})
          </h2>
        </div>

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

        {/* Pagination */}
        <div className="bg-surface-container-lowest px-6 py-4 flex items-center justify-between border-t border-outline-variant/15">
          <span className="text-sm text-on-surface-variant">
            Hiển thị {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, submissions.length)} của {submissions.length} bài nộp
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 flex items-center justify-center rounded font-medium ${
                  page === currentPage
                    ? "bg-primary text-on-primary"
                    : "hover:bg-surface-container-high transition-colors text-on-surface-variant"
                }`}
              >
                {page}
              </button>
            ))}
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
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Người nộp</span>
            <span className="text-on-surface font-medium">{submission.user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">File</span>
            <span className="text-on-surface-variant">{submission.filename}</span>
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
