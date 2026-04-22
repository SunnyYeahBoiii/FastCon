"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Send, ChevronDown, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface Contest {
  id: string;
  title: string;
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

export default function SubmitPage() {
  const [selectedContest, setSelectedContest] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contests, setContests] = useState<Contest[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch contests
  useEffect(() => {
    fetch("/api/public/contests")
      .then((res) => res.json())
      .then((data) => setContests(data.contests || []))
      .catch(console.error);
  }, []);

  // Fetch initial submissions
  const fetchMySubmissions = useCallback(() => {
    fetch("/api/submissions/user")
      .then((res) => res.json())
      .then((data) => setMySubmissions(data.submissions || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchMySubmissions();
  }, [fetchMySubmissions]);

  // SSE connection for real-time status updates
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith(".pkl")) {
        alert("Only .pkl files are accepted");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedContest) {
      alert("Please select a contest");
      return;
    }

    if (!selectedFile) {
      alert("Please upload a file");
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

      if (response.ok) {
        alert("Submission successful!");
        setSelectedFile(null);
        setSelectedContest("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        fetchMySubmissions();
      } else {
        const data = await response.json();
        alert(`Submission failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-grow pt-24 pb-20 md:pb-12 px-4 sm:px-6 lg:px-8 max-w-screen-md mx-auto w-full font-body">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
          Submit Solution
        </h1>
        <p className="text-on-surface-variant leading-relaxed">
          Upload your source code for evaluation. Ensure your logic is sound and
          highly optimized.
        </p>
      </div>

      {/* Submission form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-8 bg-surface-container-low p-6 sm:p-8 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      >
        {/* Contest selection */}
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
              onChange={(e) => setSelectedContest(e.target.value)}
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

        {/* File upload area */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-on-surface">
            Source Code
          </label>
          <div className="relative group cursor-pointer">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pkl"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              aria-label="Upload Source Code"
            />
            {/* Styled upload area */}
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

        {/* Submit button */}
        <div className="pt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full sm:w-auto px-8 py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary font-semibold text-sm rounded shadow-[0_4px_14px_0_rgba(0,61,155,0.2)] hover:shadow-[0_6px_20px_rgba(0,61,155,0.23)] transition-all tracking-wide flex items-center justify-center gap-2 ${
              isSubmitting ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? "Submitting..." : "Submit Evaluation"}
          </button>
        </div>
      </form>

      {/* My Submissions History */}
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
