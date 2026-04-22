import { spawn } from "child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJudgeTimeoutSeconds, getWorkerMaxConcurrent } from "./runtimeConfig";

const MAX_CONCURRENT = getWorkerMaxConcurrent();
const WEB_APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_ROOT = path.resolve(WEB_APP_ROOT, "..", "..");
const API_APP_ROOT = path.join(WORKSPACE_ROOT, "apps", "api");
const JUDGE_SCRIPT_PATH = path.join(API_APP_ROOT, "scripts", "judge_runner.py");
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
    const timeoutMs = getJudgeTimeoutSeconds() * 1000;

    const child = spawn(pythonBin, [JUDGE_SCRIPT_PATH, submissionId], {
      cwd: API_APP_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.stdout.on("data", (data) => {
      console.log(`[judge ${submissionId}] ${data.toString().trim()}`);
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Judge timed out after ${getJudgeTimeoutSeconds()} seconds`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Judge exited with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function runJudge(submissionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ id: submissionId, resolve, reject });
    processQueue();
  });
}
