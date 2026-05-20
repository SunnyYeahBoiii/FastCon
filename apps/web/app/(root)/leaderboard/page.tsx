"use client";

import { useState, useEffect } from "react";
import { Search, Trophy } from "lucide-react";
import { readApiError, readApiJson } from "@/lib/apiClient";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  contestId: string;
  contestTitle: string;
  score: number;
  submissionCount: number;
  recordPoints: number;
}

interface Contest {
  id: string;
  title: string;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "top10">("all");
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<string>("");
  const [contestsLoaded, setContestsLoaded] = useState(false);
  const [error, setError] = useState("");

  // Fetch contests list
  useEffect(() => {
    let active = true;

    const loadContests = async () => {
      try {
        const response = await fetch("/cs116.khtn/api/public/contests");
        if (!response.ok) {
          throw new Error(await readApiError(response, "Không thể tải danh sách cuộc thi"));
        }
        const data = await readApiJson<{ contests?: Contest[] }>(response);
        if (!active) {
          return;
        }
        const nextContests: Contest[] = data?.contests || [];
        setContests(nextContests);
        setSelectedContest((current) => {
          if (current && nextContests.some((contest) => contest.id === current)) {
            return current;
          }
          return nextContests[0]?.id ?? "";
        });
      } catch (error) {
        console.error("Fetch contests error:", error);
        if (active) {
          setError(
            error instanceof Error ? error.message : "Không thể tải danh sách cuộc thi"
          );
        }
      } finally {
        if (active) {
          setContestsLoaded(true);
        }
      }
    };

    void loadContests();

    return () => {
      active = false;
    };
  }, []);

  const queryParams = `?contestId=${encodeURIComponent(selectedContest)}`;

  useEffect(() => {
    if (!contestsLoaded) {
      return;
    }

    if (!selectedContest) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setLeaderboard([]);
    setError("");

    const loadLeaderboard = async () => {
      try {
        const response = await fetch(`/cs116.khtn/api/leaderboard${queryParams}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, "Không thể tải leaderboard"));
        }
        const data = await readApiJson<{ leaderboard?: LeaderboardEntry[] }>(response);
        if (!active) {
          return;
        }
        setLeaderboard(data?.leaderboard ?? []);
        setLoading(false);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        console.error(error);
        setError(error instanceof Error ? error.message : "Không thể tải leaderboard");
        setLoading(false);
      }
    };

    void loadLeaderboard();

    const eventSource = new globalThis.EventSource(
      `/cs116.khtn/api/leaderboard/stream${queryParams}`
    );

    eventSource.onmessage = (event) => {
      if (!active) {
        return;
      }
      try {
        const data = JSON.parse(event.data);
        if (data.type === "initial" || data.type === "update") {
          setLeaderboard(data.leaderboard ?? []);
          setLoading(false);
        }
      } catch (error) {
        console.error("Leaderboard stream event error:", error);
        setError("Không thể đọc dữ liệu cập nhật leaderboard");
      }
    };

    return () => {
      active = false;
      controller.abort();
      eventSource.close();
    };
  }, [contestsLoaded, selectedContest, queryParams]);

  const filteredLeaderboard = leaderboard
    .filter((entry) =>
      entry.userName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, filter === "top10" ? 10 : undefined);

  const getRowBackground = (rank: number) => {
    return rank % 2 === 0 ? "bg-surface" : "";
  };

  const showContestColumn = false;

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-body pt-24">
        <div className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-[-0.02em] text-on-background mb-4">
            Global Leaderboard
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            Đang tải dữ liệu...
          </p>
        </div>
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-body pt-24">
      {/* Header section */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-[-0.02em] text-on-background mb-4">
          Global Leaderboard
        </h1>
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
          Track real-time performance and algorithmic efficiency across all
          competing groups.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-error-container/20 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Search, filter and contest selector */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 bg-surface-container-low p-4 rounded-lg">
        {/* Search bar */}
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline" />
          <input
            type="text"
            placeholder="Tìm theo tên người chơi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-highest border-b-2 border-transparent focus:border-primary focus:bg-surface-container-lowest focus:ring-0 rounded transition-colors text-on-background placeholder:text-outline"
          />
        </div>

        {/* Contest selector + Filter buttons */}
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          <select
            value={selectedContest}
            onChange={(e) => setSelectedContest(e.target.value)}
            className="px-4 py-1.5 bg-surface-container-highest text-on-surface rounded text-sm font-medium border-none focus:ring-0 focus:border-b-2 focus:border-b-primary transition-colors"
          >
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
              filter === "all"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-transparent border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setFilter("top10")}
            className={`px-4 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
              filter === "top10"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-transparent border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Top 10
          </button>
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="bg-surface-container-lowest rounded-lg shadow-[0_24px_40px_rgba(25,28,30,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant text-sm font-semibold tracking-wide uppercase">
                <th className="py-4 px-6 font-medium">Hạng</th>
                <th className="py-4 px-6 font-medium">Người chơi</th>
                {showContestColumn && (
                  <th className="py-4 px-6 font-medium">Cuộc thi</th>
                )}
                <th className="py-4 px-6 font-medium text-right">Điểm</th>
                <th className="py-4 px-6 font-medium text-right">Số lần nộp</th>
                <th className="py-4 px-6 font-medium text-right">Điểm ghi sổ</th>
              </tr>
            </thead>
            <tbody className="text-on-background">
              {filteredLeaderboard.length === 0 ? (
                <tr>
                  <td
                    colSpan={showContestColumn ? 6 : 5}
                    className="py-12 text-center text-on-surface-variant"
                  >
                    Chưa có dữ liệu leaderboard
                  </td>
                </tr>
              ) : (
                filteredLeaderboard.map((entry) => (
                  <tr
                    key={`${entry.userId}-${entry.contestId}`}
                    className={`group hover:bg-surface-container-low transition-colors duration-150 ${getRowBackground(entry.rank)}`}
                  >
                    {/* Rank with trophy icon for top 3 */}
                    <td className="py-4 px-6 font-bold text-lg flex items-center gap-2">
                      <span className="text-primary">
                        {entry.rank}
                      </span>
                      {entry.rank <= 3 && (
                        <Trophy
                          className={`w-5 h-5 text-primary`}
                          fill="currentColor"
                        />
                      )}
                    </td>
                    {/* User name */}
                    <td
                      className={`py-4 px-6 ${
                        entry.rank <= 3 ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {entry.userName}
                    </td>
                    {/* Contest */}
                    {showContestColumn && (
                      <td className="py-4 px-6 text-on-surface-variant">
                        {entry.contestTitle}
                      </td>
                    )}
                    {/* Score */}
                    <td
                      className={`py-4 px-6 text-right ${
                        entry.rank <= 3
                          ? "font-medium"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {entry.score.toFixed(2)}
                    </td>
                    {/* Submission count */}
                    <td
                      className={`py-4 px-6 text-right font-bold text-primary`}
                    >
                      {entry.submissionCount}
                    </td>
                    {/* Record points */}
                    <td
                      className={`py-4 px-6 text-right font-bold text-primary`}
                    >
                      {entry.recordPoints}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
