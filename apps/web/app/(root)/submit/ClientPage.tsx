"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Send, ChevronDown, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface Contest {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: string;
  dailySubmissionLimit: number | null;
}

interface Submission {
  id: string;
  filename: string;
  status: string;
  score: number | null;
  metrics: string | null;
  createdAt: string;
  contest: { id: string; title: string };
}

interface SubmissionQuota {
  contestId: string;
  dailySubmissionLimit: number | null;
  used: number;
  remaining: number | null;
  windowStartedAt: string | null;
  resetAt: string | null;
  isLimited: boolean;
  isQuotaExceeded: boolean;
}

export default function SubmitPage() {
  const [selectedContest, setSelectedContest] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contests, setContests] = useState<Contest[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [selectedContestQuota, setSelectedContestQuota] = useState<SubmissionQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    fetch("/api/public/contests")
      .then(async (res) => {
        const data = await readJsonResponse<{ contests?: Contest[] }>(res);
        setContests(data?.contests || []);
      })
      .catch(console.error);
  }, []);

  const fetchMySubmissions = useCallback(() => {
    fetch("/api/submissions/user")
      .then(async (res) => {
        const data = await readJsonResponse<{ submissions?: Submission[] }>(res);
        setMySubmissions(data?.submissions || []);
      })
      .catch(console.error);
  }, []);

  const fetchQuota = useCallback(async (contestId: string) => {
    setQuotaLoading(true);
    setQuotaError(null);
    try {
      const response = await fetch(
        `/api/submissions/quota?contestId=${encodeURIComponent(contestId)}`
      );
      const data = await readJsonResponse<{ error?: string; quota?: SubmissionQuota }>(response);

      if (!response.ok) {
        throw new Error(data?.error || "Không thể tải quota nộp bài");
      }

      setSelectedContestQuota(data?.quota ?? null);
    } catch (error) {
      console.error("Fetch submission quota error:", error);
      setSelectedContestQuota(null);
      setQuotaError("Không thể tải số lượt nộp còn lại. Hệ thống vẫn sẽ kiểm tra quota khi bạn submit.");
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMySubmissions();
  }, [fetchMySubmissions]);

  useEffect(() => {
    if (!selectedContest) {
      setSelectedContestQuota(null);
      setQuotaError(null);
      return;
    }

    void fetchQuota(selectedContest);
  }, [selectedContest, fetchQuota]);

  useEffect(() => {
    if (!selectedContest || !selectedContestQuota?.resetAt) {
      return;
    }

    const resetAtMs = new Date(selectedContestQuota.resetAt).getTime();
    if (Number.isNaN(resetAtMs)) {
      return;
    }

    const delay = resetAtMs - Date.now();
    if (delay <= 0) {
      void fetchQuota(selectedContest);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchQuota(selectedContest);
    }, delay + 50);

    return () => window.clearTimeout(timeoutId);
  }, [selectedContest, selectedContestQuota?.resetAt, fetchQuota]);

  useEffect(() => {
    const eventSource = new EventSource("/api/submissions/stream");

    eventSource.addEventListener("initial", (event) => {
      const data = JSON.parse(event.data);
      setMySubmissions(data.submissions || []);
    });

    eventSource.addEventListener("update", (event) => {
      const { submissionId, status, score, metrics } = JSON.parse(event.data);
      setMySubmissions((prev) =>
        prev.map((sub) =>
          sub.id === submissionId
            ? { ...sub, status, score: score ?? sub.score, metrics: metrics ?? sub.metrics }
            : sub
        )
      );
    });

    eventSource.addEventListener("poll_update", (event) => {
      const data = JSON.parse(event.data);
      setMySubmissions(data.submissions || []);
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  const selectedContestRecord =
    contests.find((contest) => contest.id === selectedContest) ?? null;
  const remainingQuotaLabel = quotaLoading
    ? "Đang tải..."
    : selectedContestQuota?.isLimited === false
      ? "Không giới hạn"
      : selectedContestQuota
        ? `${selectedContestQuota.remaining ?? 0} lượt`
        : "--";
  const isSubmitDisabled =
    isSubmitting ||
    quotaLoading ||
    !selectedContest ||
    !selectedFile ||
    Boolean(selectedContestQuota?.isQuotaExceeded);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSubmitError(null);
    setSubmitNotice(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.endsWith(".pkl")) {
      setSelectedFile(null);
      e.target.value = "";
      setSubmitError("Chỉ chấp nhận file .pkl");
      return;
    }

    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitNotice(null);

    if (!selectedContest) {
      setSubmitError("Vui lòng chọn cuộc thi");
      return;
    }

    if (!selectedFile) {
      setSubmitError("Vui lòng chọn file nộp bài");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("contestId", selectedContest);

      const response = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse<{
        error?: string;
        quota?: SubmissionQuota;
      }>(response);

      if (response.ok) {
        setSubmitNotice("Bài nộp đã được nhận và đưa vào hàng chờ chấm.");
        setSelectedFile(null);
        if (data?.quota) {
          setSelectedContestQuota(data.quota);
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        fetchMySubmissions();
      } else {
        if (data?.quota) {
          setSelectedContestQuota(data.quota);
        }
        setSubmitError(data?.error || "Không thể nộp bài");
      }
    } catch (error) {
      console.error("Submission error:", error);
      setSubmitError("Nộp bài thất bại. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-grow pt-24 pb-20 md:pb-12 px-4 sm:px-6 lg:px-8 max-w-screen-md mx-auto w-full font-body">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
          Submit Solution
        </h1>
        <p className="text-on-surface-variant leading-relaxed">
          Upload your source code for evaluation. Ensure your logic is sound and
          highly optimized.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-8 bg-surface-container-low p-6 sm:p-8 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      >
        {submitNotice ? (
          <div className="rounded-lg border border-secondary-container bg-secondary-container/20 px-4 py-3 text-sm text-on-surface">
            {submitNotice}
          </div>
        ) : null}

        {submitError ? (
          <div className="rounded-lg border border-error-container/40 bg-error-container/20 px-4 py-3 text-sm text-error">
            {submitError}
          </div>
        ) : null}

        <div className="space-y-3">
          <label
            className="block text-sm font-semibold text-on-surface"
            htmlFor="contest-select"
          >
            Select Contest
          </label>
          <div className="relative">
            <select
              id="contest-select"
              value={selectedContest}
              onChange={(e) => {
                setSelectedContest(e.target.value);
                setSubmitError(null);
                setSubmitNotice(null);
              }}
              className="appearance-none w-full bg-surface-container-highest border-0 border-b-2 border-transparent text-on-surface text-sm rounded px-4 py-3 focus:ring-0 focus:border-primary focus:bg-surface-container-lowest transition-all cursor-pointer"
            >
              <option value="" disabled>
                Choose a contest to submit for...
              </option>
              {contests.map((contest) => (
                <option key={contest.id} value={contest.id}>
                  {contest.title}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        {selectedContestRecord ? (
          <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5 space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-on-surface">
                Chính sách nộp bài
              </h2>
              <p className="text-sm text-on-surface-variant">
                Hệ thống dùng cửa sổ 24 giờ tính từ lần nộp hợp lệ đầu tiên trong cửa sổ hiện tại.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoChip
                label="Trạng thái"
                value={selectedContestRecord.status === "ongoing" ? "Đang hoạt động" : "Đã hoàn thành"}
              />
              <InfoChip
                label="Hạn chót"
                value={selectedContestRecord.deadline ? formatAbsoluteTime(selectedContestRecord.deadline) : "Không có"}
              />
              <InfoChip
                label="Giới hạn 24 giờ"
                value={
                  selectedContestRecord.dailySubmissionLimit === null
                    ? "Không giới hạn"
                    : `${selectedContestRecord.dailySubmissionLimit} lượt`
                }
              />
              <InfoChip
                label="Lượt còn lại"
                value={remainingQuotaLabel}
              />
            </div>

            {quotaError ? (
              <div className="rounded-lg border border-error-container/30 bg-error-container/15 px-4 py-3 text-sm text-error">
                {quotaError}
              </div>
            ) : null}

            {!quotaLoading && selectedContestQuota ? (
              <div className="space-y-2 text-sm text-on-surface">
                {selectedContestQuota.isLimited ? (
                  <>
                    <p>
                      Đã dùng <span className="font-semibold">{selectedContestQuota.used}</span> /{" "}
                      <span className="font-semibold">
                        {selectedContestQuota.dailySubmissionLimit}
                      </span>{" "}
                      lượt trong cửa sổ hiện tại.
                    </p>

                    {selectedContestQuota.windowStartedAt ? (
                      <p className="text-on-surface-variant">
                        Cửa sổ hiện tại bắt đầu lúc{" "}
                        <span className="font-medium text-on-surface">
                          {formatAbsoluteTime(selectedContestQuota.windowStartedAt)}
                        </span>
                        .
                      </p>
                    ) : (
                      <p className="text-on-surface-variant">
                        Cửa sổ hiện tại chưa bắt đầu. Lần nộp hợp lệ tiếp theo sẽ mở một cửa sổ 24 giờ mới.
                      </p>
                    )}

                    {selectedContestQuota.resetAt ? (
                      <div className="rounded-lg bg-surface-container-high px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-on-surface-variant mb-1">
                          Reset quota
                        </div>
                        <div className="text-lg font-semibold text-on-surface">
                          {formatCountdown(selectedContestQuota.resetAt, nowMs)}
                        </div>
                        <div className="text-xs text-on-surface-variant mt-1">
                          Lúc {formatAbsoluteTime(selectedContestQuota.resetAt)}
                        </div>
                      </div>
                    ) : null}

                    {selectedContestQuota.isQuotaExceeded ? (
                      <div className="rounded-lg border border-error-container/30 bg-error-container/15 px-4 py-3 text-sm text-error">
                        Bạn đã dùng hết lượt nộp trong cửa sổ hiện tại. Hệ thống sẽ mở lại đủ lượt khi quota reset.
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-on-surface-variant">
                    Contest này hiện không giới hạn số lượt nộp.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-on-surface">
            Source Code
          </label>
          <div className="relative group cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pkl"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              aria-label="Upload Source Code"
            />
            <div
              className={`flex flex-col items-center justify-center p-12 bg-surface-container-lowest rounded-lg border-2 border-dashed transition-colors text-center relative overflow-hidden ${
                selectedFile
                  ? "border-primary bg-primary/5"
                  : "border-outline-variant/50 group-hover:border-primary/50 group-hover:bg-primary/5"
              }`}
            >
              {selectedFile ? (
                <>
                  <div className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded text-sm font-medium mb-2">
                    {selectedFile.name}
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    Click to change file
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-base font-semibold text-on-surface mb-1">
                    Drag and drop your source code here
                  </h3>
                  <p className="text-sm text-on-surface-variant mb-4">
                    or click to browse .pkl files from your device
                  </p>
                  <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-xs font-medium rounded">
                    .pkl
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="pt-6">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={`w-full sm:w-auto px-8 py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary font-semibold text-sm rounded shadow-[0_4px_14px_0_rgba(0,61,155,0.2)] transition-all tracking-wide flex items-center justify-center gap-2 ${
              isSubmitDisabled ? "opacity-70 cursor-not-allowed" : "hover:opacity-90 hover:shadow-[0_6px_20px_rgba(0,61,155,0.23)]"
            }`}
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? "Submitting..." : quotaLoading ? "Checking quota..." : "Submit Evaluation"}
          </button>
        </div>
      </form>

      {mySubmissions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">Bài nộp của tôi</h2>
          <div className="space-y-3">
            {mySubmissions.map((sub) => {
              const errorInfo = getErrorFromMetrics(sub.metrics);
              return (
                <SubmissionCard key={sub.id} sub={sub} error={errorInfo} />
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-high px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-on-surface-variant mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-on-surface">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    graded: { icon: CheckCircle, bg: "bg-primary-container/20", text: "text-primary", label: "Đã chấm" },
    queued: { icon: Clock, bg: "bg-surface-container-high", text: "text-on-surface-variant", label: "Đang chờ" },
    running: { icon: Clock, bg: "bg-tertiary-container/20", text: "text-tertiary", label: "Đang chấm", pulse: true },
    uploaded: { icon: Clock, bg: "bg-surface-container-high", text: "text-on-surface-variant", label: "Đang chờ" },
    failed: { icon: AlertCircle, bg: "bg-error-container/20", text: "text-error", label: "Thất bại" },
    error: { icon: AlertCircle, bg: "bg-error-container/20", text: "text-error", label: "Lỗi" },
  } as const;

  const c = config[status as keyof typeof config] ?? config.uploaded;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text} ${"pulse" in c && c.pulse ? "animate-pulse" : ""}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function getErrorFromMetrics(metrics: string | null): string | null {
  if (!metrics) return null;
  try {
    const parsed = JSON.parse(metrics);
    return parsed.error || null;
  } catch {
    return null;
  }
}

function SubmissionCard({ sub, error }: { sub: Submission; error: string | null }) {
  const [showError, setShowError] = useState(false);

  return (
    <div className="bg-surface-container-lowest rounded-lg p-4 shadow-[0_2px_12px_rgba(25,28,30,0.03)]">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-on-surface truncate">{sub.contest.title}</span>
            <StatusBadge status={sub.status} />
          </div>
          <div className="text-xs text-on-surface-variant">
            {new Date(sub.createdAt).toLocaleString("vi-VN")} · {sub.filename}
          </div>
        </div>
        <div className="ml-4 text-right">
          {sub.score !== null ? (
            <span className="text-lg font-bold text-primary">{sub.score.toFixed(1)}</span>
          ) : (
            <span className="text-sm text-on-surface-variant">--</span>
          )}
        </div>
      </div>

      {error && sub.status === "failed" && (
        <div className="mt-3">
          <button
            onClick={() => setShowError(!showError)}
            className="text-xs text-error flex items-center gap-1 hover:underline"
          >
            <AlertCircle className="w-3 h-3" />
            {showError ? "Ẩn lỗi" : "Xem lỗi chấm bài"}
          </button>
          {showError && (
            <pre className="mt-2 p-3 bg-error-container/20 rounded-lg text-xs font-mono text-on-surface whitespace-pre-wrap break-words max-h-48 overflow-y-auto border border-error-container/30">
              {error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function formatAbsoluteTime(value: string) {
  return new Date(value).toLocaleString("vi-VN");
}

function formatCountdown(resetAt: string, nowMs: number) {
  const remainingMs = Math.max(0, new Date(resetAt).getTime() - nowMs);
  if (remainingMs === 0) {
    return "00:00:00";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch (error) {
    console.error("Failed to parse JSON response:", error, rawText);
    return null;
  }
}
