import { spawn } from "child_process";
import { prisma } from "@/lib/db";
import path from "path";

export async function runJudge(submissionId: string): Promise<void> {
  try {
    // Update submission status to 'running'
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "running" },
    });

    const pythonBin = process.env.PYTHON_BIN || "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "judge_runner.py");

    const child = spawn(pythonBin, [scriptPath, submissionId], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Capture stdout for debugging
    child.stdout.on("data", (data) => {
      console.log(`[judge stdout] ${data.toString().trim()}`);
    });

    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", async (code) => {
      try {
        if (code === 0) {
          // Read the updated submission from DB (Python script already updated it)
          const submission = await prisma.submission.findUnique({
            where: { id: submissionId },
          });

          if (submission && submission.status === "graded") {
            console.log(
              `Submission ${submissionId} graded successfully: score=${submission.score}`
            );
          } else {
            // Python script might have failed silently, mark as failed
            await prisma.submission.update({
              where: { id: submissionId },
              data: { status: "failed" },
            });
            console.log(
              `Submission ${submissionId} marking failed: ${stderr}`
            );
          }
        } else {
          // Non-zero exit code - update status to 'failed'
          await prisma.submission.update({
            where: { id: submissionId },
            data: { status: "failed" },
          });
          console.log(
            `Submission ${submissionId} judge failed (code=${code}): ${stderr}`
          );
        }
      } catch (dbError) {
        console.error("Error updating submission status:", dbError);
      }
    });

    child.on("error", async (err) => {
      console.error("Judge spawn error:", err);
      try {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: "failed" },
        });
      } catch (dbError) {
        console.error("Error updating submission status:", dbError);
      }
    });
  } catch (error) {
    console.error("Judge initialization error:", error);
    try {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "failed" },
      });
    } catch (dbError) {
      console.error("Error updating submission status:", dbError);
    }
  }
}