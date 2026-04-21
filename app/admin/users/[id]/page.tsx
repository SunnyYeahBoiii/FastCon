"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, KeyRound, FileCheck, Trophy } from "lucide-react";
import Link from "next/link";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  submissions: Submission[];
}

interface Submission {
  id: string;
  filename: string;
  status: string;
  score: number | null;
  createdAt: string;
  contest: {
    id: string;
    code: string;
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case "graded":
      return "bg-primary-container text-on-primary";
    case "uploaded":
      return "bg-surface-container-high text-on-surface-variant";
    case "grading":
      return "bg-tertiary-container text-on-tertiary";
    case "error":
      return "bg-error-container text-error";
    default:
      return "bg-surface-container-high text-on-surface-variant";
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case "graded":
      return "Đã chấm";
    case "uploaded":
      return "Chờ chấm";
    case "grading":
      return "Đang chấm";
    case "error":
      return "Lỗi";
    default:
      return status;
  }
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");

  // Password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    params.then((p) => setUserId(p.id));
  }, [params]);

  useEffect(() => {
    if (!userId) return;

    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/users/${userId}`);
        const data = await res.json();
        setUser(data.user);
      } catch (error) {
        console.error("Fetch user error:", error);
      }
      setLoading(false);
    };

    fetchUser();
  }, [userId]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu không khớp");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      if (res.ok) {
        setPasswordSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        setPasswordError(data.error || "Lỗi khi cập nhật mật khẩu");
      }
    } catch (error) {
      setPasswordError("Lỗi kết nối");
    }
    setIsUpdatingPassword(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-on-surface-variant">Đang tải...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-on-surface-variant">Không tìm thấy người dùng</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Back Button */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại danh sách
      </Link>

      {/* User Info Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xl">
            {getInitials(user.name)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{user.name}</h1>
            <p className="text-on-surface-variant">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                user.role === "admin"
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {user.role === "admin" ? "Quản trị viên" : "Thí sinh"}
            </span>
          </div>
          <div className="text-on-surface-variant">
            Đăng ký: {formatDate(user.createdAt)}
          </div>
        </div>
      </div>

      {/* Password Reset Section */}
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-on-surface">Đặt lại mật khẩu</h2>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {passwordError && (
            <div className="bg-error-container/20 text-error rounded-lg px-4 py-2 text-sm">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="bg-primary-container/20 text-primary rounded-lg px-4 py-2 text-sm">
              Mật khẩu đã được cập nhật thành công
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">
                Mật khẩu mới
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">
                Xác nhận mật khẩu
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isUpdatingPassword || !newPassword || !confirmPassword}
            className="px-6 py-2 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-50"
          >
            {isUpdatingPassword ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
          </button>
        </form>
      </div>

      {/* Recent Submissions Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
        <div className="p-6 border-b border-outline-variant/15">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-on-surface">Bài nộp gần đây</h2>
          </div>
        </div>

        {user.submissions.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant">
            <FileCheck className="w-12 h-12 mx-auto mb-2 text-on-surface-variant/50" />
            <p>Người dùng chưa có bài nộp nào</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant font-semibold text-sm border-b border-outline-variant/15">
                <th className="py-3 px-6 font-medium">Cuộc thi</th>
                <th className="py-3 px-6 font-medium">File</th>
                <th className="py-3 px-6 font-medium">Điểm</th>
                <th className="py-3 px-6 font-medium">Trạng thái</th>
                <th className="py-3 px-6 font-medium">Thời gian</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-outline-variant/10">
              {user.submissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      <span className="font-medium text-on-surface">{submission.contest.title}</span>
                      <span className="text-xs text-on-surface-variant">({submission.contest.code})</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-on-surface-variant">{submission.filename}</td>
                  <td className="py-4 px-6">
                    {submission.score !== null ? (
                      <span className="font-medium text-primary">{submission.score.toFixed(2)}</span>
                    ) : (
                      <span className="text-on-surface-variant">--</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(submission.status)}`}>
                      {getStatusText(submission.status)}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-on-surface-variant">{formatDate(submission.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}