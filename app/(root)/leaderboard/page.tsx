"use client";

import { useState, useEffect } from "react";
import { Search, Trophy } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  contestId: string;
  contestTitle: string;
  score: number;
  submissionCount: number;
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

  // Fetch contests list
  useEffect(() => {
    fetch("/api/public/contests")
      .then((r) => r.json())
      .then((data) => setContests(data.contests || []))
      .catch(console.error);
  }, []);

  const queryParams = selectedContest ? `?contestId=${selectedContest}` : "";

  // Fetch initial data
  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard${queryParams}`)
      .then((r) => r.json())
      .then((data) => {
        setLeaderboard(data.leaderboard);
        setLoading(false);
      })
      .catch(console.error);
  }, [selectedContest]);

  // SSE connection for real-time updates
  useEffect(() => {
    const eventSource = new EventSource(`/api/leaderboard/stream${queryParams}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "initial" || data.type === "update") {
        setLeaderboard(data.leaderboard);
        setLoading(false);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [selectedContest]);

  const filteredLeaderboard = leaderboard
    .filter((entry) =>
      entry.userName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, filter === "top10" ? 10 : leaderboard.length);

  const getTrophyColor = (rank: number) => {
    if (rank === 1) return "text-tertiary-container";
    if (rank === 2) return "text-outline";
    if (rank === 3) return "text-secondary";
    return "";
  };

  const getRowBackground = (rank: number) => {
    return rank % 2 === 0 ? "bg-surface" : "";
  };

  const showContestColumn = !selectedContest;

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
            <option value="">Tất cả cuộc thi</option>
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
              </tr>
            </thead>
            <tbody className="text-on-background">
              {filteredLeaderboard.length === 0 ? (
                <tr>
                  <td
                    colSpan={showContestColumn ? 5 : 4}
                    className="py-12 text-center text-on-surface-variant"
                  >
                    Chưa có dữ liệu leaderboard
                  </td>
                </tr>
              ) : (
                filteredLeaderboard.map((entry) => (
                  <tr
                    key={entry.userId}
                    className={`group hover:bg-surface-container-low transition-colors duration-150 ${getRowBackground(entry.rank)}`}
                  >
                    {/* Rank with trophy icon for top 3 */}
                    <td className="py-4 px-6 font-bold text-lg flex items-center gap-2">
                      <span className={getTrophyColor(entry.rank)}>
                        {entry.rank}
                      </span>
                      {entry.rank <= 3 && (
                        <Trophy
                          className={`w-5 h-5 ${getTrophyColor(entry.rank)}`}
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
                      className={`py-4 px-6 text-right ${
                        entry.rank <= 3
                          ? "font-bold text-primary"
                          : "font-semibold text-primary-container"
                      }`}
                    >
                      {entry.submissionCount}
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
