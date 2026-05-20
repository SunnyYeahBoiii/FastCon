"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiError, readApiJson } from "@/lib/apiClient";
import { APP_TIME_ZONE_LABEL, formatHoChiMinhDatetimeLocal } from "@/lib/timeZone";

interface Contest {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: string;
  dailySubmissionLimit: number | null;
  groundTruthPath: string | null;
}

export default function EditForm({ contest }: { contest: Contest }) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: contest.title,
    description: contest.description || "",
    deadline: contest.deadline ? formatHoChiMinhDatetimeLocal(contest.deadline) : "",
    dailySubmissionLimit: contest.dailySubmissionLimit?.toString() || "",
    status: contest.status,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/cs116.khtn/api/contests/${contest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        setError(await readApiError(response, "Không thể cập nhật cuộc thi"));
        return;
      }
      const data = await readApiJson<{ ok?: boolean; error?: string }>(response);
      if (data?.ok) {
        router.refresh();
      } else {
        setError(data?.error || "Không thể cập nhật cuộc thi");
      }
    } catch (error) {
      console.error("Update contest error:", error);
      setError("Không thể cập nhật cuộc thi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6">
      <h2 className="text-lg font-bold text-on-surface mb-4">
        <span className="material-symbols-outlined inline-block mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>
          edit
        </span>
        Chỉnh sửa thông tin
      </h2>

      {error && (
        <div className="mb-4 rounded-lg bg-error-container/20 px-4 py-2 text-sm text-error">
          {error}
        </div>
      )}

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
            Hạn chót (giờ {APP_TIME_ZONE_LABEL})
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
      </div>

      <div className="mt-6 flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>
    </div>
  );
}
