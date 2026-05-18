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
  isOpenForSubmission: boolean;
}

interface SubmitPageProps {
  initialContests: Contest[];
  initialContestId?: string | null;
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
  deadline: string | null;
  serverNow: string;
  isDeadlinePassed: boolean;
  used: number;
  remaining: number | null;
  windowStartedAt: string | null;
  resetAt: string | null;
  isLimited: boolean;
  isQuotaExceeded: boolean;
}

function pickInitialContestId(contests: Contest[], preferredId: string | null | undefined) {
  if (preferredId && contests.some((contest) => contest.id === preferredId)) {
    return preferredId;
  }

  const firstOpen = contests.find((contest) => contest.isOpenForSubmission);
  return firstOpen?.id ?? "";
}

export default function SubmitPage({
  initialContests,
  initialContestId = null,
}: SubmitPageProps) {
  const [selectedContest, setSelectedContest] = useState(() =>
    pickInitialContestId(initialContests, initialContestId)
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contests, setContests] = useState<Contest[]>(initialContests);
  const [contestsLoading, setContestsLoading] = useState(false);
  const [contestsError, setContestsError] = useState<string | null>(null);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [selectedContestQuota, setSelectedContestQuota] = useState<SubmissionQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [hasMounted, setHasMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasMounted(true);
    setNowMs(Date.now() + serverTimeOffsetMs);
  }, [serverTimeOffsetMs]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now() + serverTimeOffsetMs);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [hasMounted, serverTimeOffsetMs]);

  const fetchContests = useCallback(async () => {
    setContestsLoading(true);
    setContestsError(null);

    try {
      const response = await fetch("/cs116.khtn/api/public/contests");
      const data = await readJsonResponse<{ contests?: Contest[]; error?: string }>(response);

      if (!response.ok) {
        throw new Error(data?.error || "Không thể tải danh sách cuộc thi");
      }

      const nextContests = data?.contests ?? [];
      setContests(nextContests);
      setSelectedContest((current) => {
        if (current && nextContests.some((contest) => contest.id === current)) {
          return current;
        }
        return pickInitialContestId(nextContests, initialContestId);
      });
    } catch (error) {
      console.error("Fetch contests error:", error);
      setContestsError("Không thể tải danh sách cuộc thi. Vui lòng thử lại.");
    } finally {
      setContestsLoading(false);
    }
  }, [initialContestId]);

  useEffect(() => {
    if (initialContests.length > 0) {
      return;
    }
    void fetchContests();
  }, [fetchContests, initialContests.length]);

  const fetchMySubmissions = useCallback(() => {
    fetch("/cs116.khtn/api/submissions/user")
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
        `/cs116.khtn/api/submissions/quota?contestId=${encodeURIComponent(contestId)}`
      );
      const data = await readJsonResponse<{ error?: string; quota?: SubmissionQuota }>(response);

      if (!response.ok) {
        throw new Error(data?.error || "Không thể tải quota nộp bài");
      }

      if (data?.quota?.serverNow) {
        const serverNowMs = new Date(data.quota.serverNow).getTime();
        if (!Number.isNaN(serverNowMs)) {
          setServerTimeOffsetMs(serverNowMs - Date.now());
        }
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
    const eventSource = new EventSource("/cs116.khtn/api/submissions/stream");

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

  const openContests = contests.filter((contest) => contest.isOpenForSubmission);
  const closedContests = contests.filter((contest) => !contest.isOpenForSubmission);
  const selectedContestRecord =
    contests.find((contest) => contest.id === selectedContest) ?? null;
  const selectedContestIsOpen = selectedContestRecord?.isOpenForSubmission ?? false;
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
    contestsLoading ||
    !selectedContest ||
    !selectedContestIsOpen ||
    !selectedFile ||
    Boolean(selectedContestQuota?.isDeadlinePassed) ||
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

    if (!selectedContestIsOpen) {
      setSubmitError("Cuộc thi này không còn nhận bài nộp.");
      return;
    }

    if (!selectedFile) {
      setSubmitError("Vui lòng chọn file nộp bài");
      return;
    }

    if (selectedContestQuota?.isDeadlinePassed) {
      setSubmitError("Đã quá hạn nộp bài cho contest này.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("contestId", selectedContest);

      const response = await fetch("/cs116.khtn/api/submissions", {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse<{
        code?: string;
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
        if (data?.code === "CONTEST_DEADLINE_PASSED") {
          setSubmitError("Đã quá hạn nộp bài cho contest này.");
        } else if (data?.code === "CONTEST_CLOSED") {
          setSubmitError("Cuộc thi này đã đóng, không nhận bài nộp.");
          void fetchContests();
        } else if (data?.code === "SUBMISSION_LIMIT_REACHED") {
          setSubmitError("Bạn đã dùng hết lượt nộp trong cửa sổ 24 giờ hiện tại.");
        } else {
          setSubmitError(data?.error || "Không thể nộp bài");
        }
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
          <div className="flex items-center justify-between gap-3">
            <label
              className="block text-sm font-semibold text-on-surface"
              htmlFor="contest-select"
            >
              Select Contest
            </label>
            <button
              type="button"
              onClick={() => void fetchContests()}
              disabled={contestsLoading}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
            >
              {contestsLoading ? "Đang tải..." : "Làm mới"}
            </button>
          </div>

          {contestsError ? (
            <div className="rounded-lg border border-error-container/40 bg-error-container/20 px-4 py-3 text-sm text-error">
              {contestsError}
            </div>
          ) : null}

          {contestsLoading && contests.length === 0 ? (
            <div className="rounded-lg bg-surface-container-highest px-4 py-3 text-sm text-on-surface-variant">
              Đang tải danh sách cuộc thi...
            </div>
          ) : contests.length === 0 ? (
            <div className="rounded-lg bg-surface-container-highest px-4 py-3 text-sm text-on-surface-variant">
              Hiện chưa có cuộc thi nào để nộp bài.
            </div>
          ) : (
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
              <option value="" disabled={openContests.length > 0}>
                {openContests.length > 0
                  ? "Chọn cuộc thi để nộp bài..."
                  : "Không có cuộc thi đang mở"}
              </option>
              {openContests.length > 0 ? (
                <optgroup label="Đang mở nộp bài">
                  {openContests.map((contest) => (
                    <option key={contest.id} value={contest.id}>
                      {contest.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {closedContests.length > 0 ? (
                <optgroup label="Đã đóng / quá hạn">
                  {closedContests.map((contest) => (
                    <option key={contest.id} value={contest.id} disabled>
                      {contest.title}
                      {contest.deadline
                        ? ` — hạn ${formatAbsoluteTime(contest.deadline, hasMounted)}`
                        : " — đã đóng"}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
          )}
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
                value={
                  selectedContestRecord.isOpenForSubmission
                    ? "Đang mở nộp bài"
                    : selectedContestRecord.status === "ongoing"
                      ? "Đã quá hạn"
                      : "Đã hoàn thành"
                }
              />
              <InfoChip
                label="Hạn chót"
                value={
                  selectedContestRecord.deadline
                    ? formatAbsoluteTime(selectedContestRecord.deadline, hasMounted)
                    : "Không có"
                }
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

            {!selectedContestIsOpen ? (
              <div className="rounded-lg border border-error-container/30 bg-error-container/15 px-4 py-3 text-sm text-error">
                Cuộc thi này không còn nhận bài nộp. Vui lòng chọn cuộc thi khác trong danh sách.
              </div>
            ) : null}

            {quotaError ? (
              <div className="rounded-lg border border-error-container/30 bg-error-container/15 px-4 py-3 text-sm text-error">
                {quotaError}
              </div>
            ) : null}

            {!quotaLoading && selectedContestQuota?.isDeadlinePassed ? (
              <div className="rounded-lg border border-error-container/30 bg-error-container/15 px-4 py-3 text-sm text-error">
                Contest đã quá hạn nộp bài. Hệ thống dùng thời gian backend để xác định hạn chót.
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
                          {formatAbsoluteTime(selectedContestQuota.windowStartedAt, hasMounted)}
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
                        <div
                          className="text-lg font-semibold text-on-surface"
                          suppressHydrationWarning
                        >
                          {hasMounted
                            ? formatCountdown(selectedContestQuota.resetAt, nowMs)
                            : "--:--:--"}
                        </div>
                        <div className="text-xs text-on-surface-variant mt-1">
                          Lúc {formatAbsoluteTime(selectedContestQuota.resetAt, hasMounted)}
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
            {isSubmitting
              ? "Submitting..."
              : quotaLoading
                ? "Checking quota..."
                : !selectedContestIsOpen
                  ? "Submission Closed"
                  : selectedContestQuota?.isDeadlinePassed
                    ? "Submission Closed"
                    : selectedContestQuota?.isQuotaExceeded
                      ? "Quota Exceeded"
                      : "Submit Evaluation"}
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
            <span suppressHydrationWarning>
              {new Date(sub.createdAt).toLocaleString("vi-VN")}
            </span>{" "}
            · {sub.filename}
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

function formatAbsoluteTime(value: string, localeReady: boolean) {
  if (!localeReady) {
    return new Date(value).toISOString().replace("T", " ").slice(0, 16);
  }
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
  } catch {
    const fallback =
      rawText.length <= 200 ? rawText.trim() : `${rawText.trim().slice(0, 200)}...`;
    return { error: fallback || response.statusText || "Invalid response" } as T;
  }
}
