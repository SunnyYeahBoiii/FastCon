import { prisma } from "@/lib/db";

export const publicContestSelect = {
  id: true,
  title: true,
  description: true,
  deadline: true,
  status: true,
  dailySubmissionLimit: true,
} as const;

export type PublicContestRecord = {
  id: string;
  title: string;
  description: string | null;
  deadline: Date | null;
  status: string;
  dailySubmissionLimit: number | null;
};

export type SerializedPublicContest = {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: string;
  dailySubmissionLimit: number | null;
  isOpenForSubmission: boolean;
};

export function normalizeContestStatus(status: string | null | undefined): string {
  return (status ?? "ongoing").trim().toLowerCase();
}

export function isContestOpenForSubmission(
  contest: Pick<PublicContestRecord, "status" | "deadline">,
  now: Date = new Date()
): boolean {
  if (normalizeContestStatus(contest.status) !== "ongoing") {
    return false;
  }

  if (!contest.deadline) {
    return true;
  }

  return contest.deadline.getTime() > now.getTime();
}

export function serializePublicContest(
  contest: PublicContestRecord,
  now: Date = new Date()
): SerializedPublicContest {
  return {
    id: contest.id,
    title: contest.title,
    description: contest.description,
    deadline: contest.deadline?.toISOString() ?? null,
    status: normalizeContestStatus(contest.status),
    dailySubmissionLimit: contest.dailySubmissionLimit,
    isOpenForSubmission: isContestOpenForSubmission(contest, now),
  };
}

/** Contests shown on the submit picker (excludes admin-closed contests). */
export async function getContestsForSubmitPicker(): Promise<PublicContestRecord[]> {
  return prisma.contest.findMany({
    where: {
      NOT: { status: "completed" },
    },
    orderBy: { createdAt: "desc" },
    select: publicContestSelect,
  });
}

/** Contests that still accept submissions (ongoing + before deadline). */
export async function getOpenContestsForSubmission(): Promise<PublicContestRecord[]> {
  const contests = await getContestsForSubmitPicker();
  return contests.filter((contest) => isContestOpenForSubmission(contest));
}

export async function getSerializedContestsForSubmitPicker(): Promise<SerializedPublicContest[]> {
  const now = new Date();
  const contests = await getContestsForSubmitPicker();
  return contests.map((contest) => serializePublicContest(contest, now));
}
