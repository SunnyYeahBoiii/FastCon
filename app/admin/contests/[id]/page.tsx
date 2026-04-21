import { prisma } from "@/lib/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import EditForm from "./EditForm";
import GroundTruthSection from "./GroundTruthSection";
import SubmissionsTable from "./SubmissionsTable";

interface ContestDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getContest(id: string) {
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      submissions: {
        include: {
          user: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return contest;
}

export default async function ContestDetailPage({ params }: ContestDetailPageProps) {
  const { id } = await params;
  const contest = await getContest(id);

  if (!contest) {
    notFound();
  }

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-8">
        <Link
          href="/admin/contests"
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Quay lại danh sách</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              event_note
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-surface">
              {contest.title}
            </h1>
            <p className="text-on-surface-variant font-medium">
              Mã: {contest.code}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <EditForm
          contest={{
            id: contest.id,
            code: contest.code,
            title: contest.title,
            description: contest.description,
            deadline: contest.deadline?.toISOString() || null,
            status: contest.status,
            dailySubmissionLimit: contest.dailySubmissionLimit,
            groundTruthPath: contest.groundTruthPath,
          }}
        />
        <GroundTruthSection
          contestId={contest.id}
          contestCode={contest.code}
          groundTruthPath={contest.groundTruthPath}
        />
      </div>

      {/* Submissions */}
      <SubmissionsTable
        submissions={contest.submissions.map((s) => ({
          id: s.id,
          filename: s.filename,
          score: s.score,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          user: {
            name: s.user.name,
          },
        }))}
      />
    </div>
  );
}