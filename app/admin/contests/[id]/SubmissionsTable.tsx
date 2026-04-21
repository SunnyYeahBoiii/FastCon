"use client";

import { useState } from "react";

interface Submission {
  id: string;
  filename: string;
  score: number | null;
  status: string;
  createdAt: string;
  user: {
    name: string;
  };
}

interface SubmissionsTableProps {
  submissions: Submission[];
}

export default function SubmissionsTable({ submissions }: SubmissionsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(submissions.length / pageSize);

  const paginatedSubmissions = submissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const formatStatus = (status: string) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      uploaded: { label: "Đã nộp", class: "bg-surface-container-highest text-on-surface-variant" },
      pending: { label: "Chờ xử lý", class: "bg-tertiary-container text-on-tertiary" },
      graded: { label: "Đã chấm", class: "bg-secondary-container text-on-secondary" },
      error: { label: "Lỗi", class: "bg-error-container text-on-error" },
    };
    return statusMap[status] || { label: status, class: "bg-surface-container-highest text-on-surface-variant" };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
          {paginatedSubmissions.map((submission) => (
            <tr key={submission.id} className="hover:bg-surface-container-low/50 transition-colors">
              <td className="py-4 px-6 text-on-surface font-medium">{submission.user.name}</td>
              <td className="py-4 px-6 text-on-surface-variant">{submission.filename}</td>
              <td className="py-4 px-6">
                {submission.score !== null ? (
                  <span className="text-on-surface font-semibold">{submission.score.toFixed(2)}</span>
                ) : (
                  <span className="text-on-surface-variant">-</span>
                )}
              </td>
              <td className="py-4 px-6">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${formatStatus(submission.status).class}`}>
                  {formatStatus(submission.status).label}
                </span>
              </td>
              <td className="py-4 px-6 text-on-surface-variant">{formatDate(submission.createdAt)}</td>
            </tr>
          ))}
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
  );
}