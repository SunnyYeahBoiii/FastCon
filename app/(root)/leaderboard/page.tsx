"use client";

import { useState } from "react";
import { Search, Trophy } from "lucide-react";

// Mock leaderboard data
const mockLeaderboard = [
  { rank: 1, groupName: "Alpha Team", score: 1250, recordedPts: 10 },
  { rank: 2, groupName: "Beta Squad", score: 1180, recordedPts: 9 },
  { rank: 3, groupName: "Code Warriors", score: 1120, recordedPts: 9 },
  { rank: 4, groupName: "Data Masters", score: 1050, recordedPts: 8 },
  { rank: 5, groupName: "Logic Builders", score: 980, recordedPts: 8 },
  { rank: 6, groupName: "Algo Knights", score: 920, recordedPts: 8 },
  { rank: 7, groupName: "Byte Runners", score: 890, recordedPts: 8 },
  { rank: 8, groupName: "Neural Netters", score: 850, recordedPts: 7 },
  { rank: 9, groupName: "Quantum Coders", score: 810, recordedPts: 7 },
  { rank: 10, groupName: "Precision Team", score: 780, recordedPts: 7 },
  { rank: 11, groupName: "Optimized Minds", score: 720, recordedPts: 7 },
];

export default function LeaderboardPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "top10">("all");

  // Filter leaderboard based on search and filter
  const filteredLeaderboard = mockLeaderboard
    .filter((entry) =>
      entry.groupName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, filter === "top10" ? 10 : mockLeaderboard.length);

  // Get trophy color based on rank
  const getTrophyColor = (rank: number) => {
    if (rank === 1) return "text-tertiary-container";
    if (rank === 2) return "text-outline";
    if (rank === 3) return "text-secondary";
    return "";
  };

  // Get row background based on alternating
  const getRowBackground = (rank: number) => {
    return rank % 2 === 0 ? "bg-surface" : "";
  };

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

      {/* Search and filter controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 bg-surface-container-low p-4 rounded-lg">
        {/* Search bar */}
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-outline" />
          <input
            type="text"
            placeholder="Search by group name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-highest border-b-2 border-transparent focus:border-primary focus:bg-surface-container-lowest focus:ring-0 rounded transition-colors text-on-background placeholder:text-outline"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
              filter === "all"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-transparent border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            All Groups
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
                <th className="py-4 px-6 font-medium">Rank</th>
                <th className="py-4 px-6 font-medium">Group Name</th>
                <th className="py-4 px-6 font-medium text-right">Score</th>
                <th className="py-4 px-6 font-medium text-right">Recorded Pts</th>
              </tr>
            </thead>
            <tbody className="text-on-background">
              {filteredLeaderboard.map((entry) => (
                <tr
                  key={entry.rank}
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
                  {/* Group name */}
                  <td
                    className={`py-4 px-6 ${
                      entry.rank <= 3 ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {entry.groupName}
                  </td>
                  {/* Score */}
                  <td
                    className={`py-4 px-6 text-right ${
                      entry.rank <= 3
                        ? "font-medium"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {entry.score}
                  </td>
                  {/* Recorded points */}
                  <td
                    className={`py-4 px-6 text-right ${
                      entry.rank <= 3
                        ? "font-bold text-primary"
                        : "font-semibold text-primary-container"
                    }`}
                  >
                    {entry.recordedPts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}