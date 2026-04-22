import { prisma } from "@/lib/db";
import { Trophy, Users, Clock, ArrowRight } from "lucide-react";

export default async function ContestsPage() {
  // Fetch contests from database
  const contests = await prisma.contest.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  // Count participants for each contest
  const contestsWithParticipants = await Promise.all(
    contests.map(async (contest) => {
      const participantCount = await prisma.submission.count({
        where: { contestId: contest.id },
      });
      return {
        ...contest,
        participantCount,
      };
    })
  );

  return (
    <main className="pt-24 pb-20 px-6 max-w-screen-xl mx-auto font-body">
      {/* Running Contests Section */}
      <section className="mb-12">
        {/* Section header with blue accent bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary rounded-full"></div>
            <h3 className="text-2xl font-bold tracking-tight text-on-surface">
              Running Contests
            </h3>
          </div>
          
        </div>

        {/* Contests list container */}
        <div className="bg-surface-container-low rounded-xl overflow-hidden shadow-sm">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-surface-container-high/50 border-b border-outline-variant/20">
            <div className="col-span-6 text-sm font-bold text-on-surface-variant uppercase tracking-wider">
              Contest Name
            </div>
            <div className="col-span-2 text-sm font-bold text-on-surface-variant uppercase tracking-wider text-center">
              Status
            </div>
            <div className="col-span-2 text-sm font-bold text-on-surface-variant uppercase tracking-wider text-center">
              Deadline
            </div>
            <div className="col-span-2 text-sm font-bold text-on-surface-variant uppercase tracking-wider text-center">
              Duration
            </div>
          </div>

          {/* Contest items */}
          {contestsWithParticipants.length === 0 ? (
            <div className="px-6 py-8 text-center text-on-surface-variant">
              No contests available at this time.
            </div>
          ) : (
            contestsWithParticipants.map((contest, index) => (
              <div
                key={contest.id}
                className={`grid grid-cols-12 gap-4 px-6 py-8 items-center bg-surface-container-lowest hover:bg-surface-bright transition-colors ${
                  index < contestsWithParticipants.length - 1
                    ? "border-b border-outline-variant/10"
                    : ""
                }`}
              >
                {/* Contest title and metadata */}
                <div className="col-span-6">
                  <h4 className="text-lg font-bold text-primary mb-1">
                    {contest.title}
                  </h4>
                  <div className="flex items-center gap-3">
                    {/* Status badge */}
                    <span className="bg-secondary-container text-on-secondary-container text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                      {contest.status || "Ongoing"}
                    </span>
                    {/* Participant count */}
                    <span className="text-sm text-on-surface-variant flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {contest.participantCount} participants
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div className="col-span-2 text-center">
                  <span className="bg-secondary-container text-on-secondary-container text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                    {contest.status || "Ongoing"}
                  </span>
                </div>

                {/* Deadline */}
                <div className="col-span-2 text-center">
                  <p className="text-sm font-medium text-on-surface">
                    {contest.deadline
                      ? new Date(contest.deadline).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "No deadline"}
                  </p>
                  {contest.deadline && (
                    <p className="text-[10px] text-on-surface-variant">
                      {new Date(contest.deadline).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>

                {/* Duration placeholder */}
                <div className="col-span-2 text-center">
                  <div className="inline-flex items-center gap-1 bg-surface-container-high px-3 py-1 rounded-full text-xs font-semibold text-on-surface-variant">
                    <Clock className="w-3 h-3" />
                    300m
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}