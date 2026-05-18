"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { SubmissionQuotaSnapshot } from "@/lib/submissionQuota";

interface QuotaUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

interface QuotaEntry {
  user: QuotaUser;
  quota: SubmissionQuotaSnapshot;
}

interface QuotaResetSectionProps {
  contestId: string;
}

function formatDate(value: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quotaLabel(quota: SubmissionQuotaSnapshot) {
  if (!quota.isLimited) return "Không giới hạn";
  return `${quota.used}/${quota.dailySubmissionLimit ?? 0}`;
}

export default function QuotaResetSection({ contestId }: QuotaResetSectionProps) {
  const [entries, setEntries] = useState<QuotaEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.user.id === selectedUserId) ?? null,
    [entries, selectedUserId]
  );

  const fetchQuota = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/cs116.khtn/api/contests/${contestId}/quota`);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Không thể tải quota");
      }
      const nextEntries = data.entries as QuotaEntry[];
      setEntries(nextEntries);
      setSelectedUserId((current) => current || nextEntries[0]?.user.id || "");
    } catch (fetchError) {
      console.error("Fetch contest quota error:", fetchError);
      setError("Không thể tải quota nộp bài");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId]);

  const handleReset = async () => {
    if (!selectedEntry || resetting) return;
    const confirmed = window.confirm(
      `Reset quota nộp bài của ${selectedEntry.user.name}?`
    );
    if (!confirmed) return;

    setResetting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/cs116.khtn/api/contests/${contestId}/quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedEntry.user.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Không thể reset quota");
      }

      const updatedEntry = data.entry as QuotaEntry;
      setEntries((current) =>
        current.map((entry) =>
          entry.user.id === updatedEntry.user.id ? updatedEntry : entry
        )
      );
      setNotice(
        data.resetCount > 0
          ? "Đã reset quota nộp bài"
          : "Quota nộp bài đang trống"
      );
    } catch (resetError) {
      console.error("Reset quota error:", resetError);
      setError("Không thể reset quota nộp bài");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-on-surface">Reset quota nộp bài</h2>
      </div>

      {error ? (
        <div className="mb-4 p-3 bg-error-container/20 text-error rounded-lg text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 p-3 bg-primary-container/30 text-primary rounded-lg text-sm">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
        <label className="block">
          <span className="block text-sm font-medium text-on-surface-variant mb-2">
            Người dùng
          </span>
          <select
            value={selectedUserId}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
              setNotice("");
            }}
            disabled={loading || entries.length === 0}
            className="w-full px-4 py-2.5 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
          >
            {entries.map((entry) => (
              <option key={entry.user.id} value={entry.user.id}>
                {entry.user.name} ({entry.user.username})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleReset}
          disabled={loading || resetting || !selectedEntry || !selectedEntry.quota.isLimited}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-error text-on-error rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-4 h-4" />
          {resetting ? "Đang reset..." : "Reset quota"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        <div className="rounded-lg bg-surface-container-highest p-4">
          <div className="text-xs font-medium text-on-surface-variant mb-1">Đã dùng</div>
          <div className="text-xl font-semibold text-on-surface">
            {selectedEntry ? quotaLabel(selectedEntry.quota) : loading ? "..." : "Chưa có"}
          </div>
        </div>
        <div className="rounded-lg bg-surface-container-highest p-4">
          <div className="text-xs font-medium text-on-surface-variant mb-1">Còn lại</div>
          <div className="text-xl font-semibold text-on-surface">
            {selectedEntry?.quota.remaining ?? "Không giới hạn"}
          </div>
        </div>
        <div className="rounded-lg bg-surface-container-highest p-4">
          <div className="text-xs font-medium text-on-surface-variant mb-1">Reset lúc</div>
          <div className="text-sm font-medium text-on-surface">
            {formatDate(selectedEntry?.quota.resetAt ?? null)}
          </div>
        </div>
      </div>
    </section>
  );
}
