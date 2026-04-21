import { spawn } from "child_process";
import path from "path";

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JUDGES || "3", 10);
let running = 0;
const queue: Array<{ id: string; resolve: (v: void) => void; reject: (e: Error) => void }> = [];

function processQueue(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    running++;
    runJudgeInternal(item.id)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        running--;
        processQueue();
      });
  }
}

function runJudgeInternal(submissionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "judge_runner.py");

    const child = spawn(pythonBin, [scriptPath, submissionId], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.stdout.on("data", (data) => {
      console.log(`[judge ${submissionId}] ${data.toString().trim()}`);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Judge exited with code ${code}: ${stderr}`));
      }
    });

    child.on("error", reject);
  });
}

export async function runJudge(submissionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ id: submissionId, resolve, reject });
    processQueue();
  });
}
