import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_ROOT = path.resolve(WEB_APP_ROOT, "..", "..");

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveFromWorkspace(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(WORKSPACE_ROOT, value);
}

export function getFastApiInternalUrl(): string | null {
  const raw = readEnv("FASTAPI_INTERNAL_URL") ?? readEnv("JUDGE_SERVICE_URL");
  if (!raw) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function getStorageRoot(): string {
  const storageRoot = readEnv("STORAGE_ROOT");
  if (storageRoot) return resolveFromWorkspace(storageRoot);

  const uploadDir = readEnv("UPLOAD_DIR");
  if (uploadDir) return path.dirname(resolveFromWorkspace(uploadDir));

  return path.join(WORKSPACE_ROOT, "storage");
}

export function getSubmissionsRoot(): string {
  return path.join(getStorageRoot(), "submissions");
}

export function getTestdataRoot(): string {
  return path.join(getStorageRoot(), "testdata");
}

export function getWorkerMaxConcurrent(): number {
  const raw = readEnv("WORKER_MAX_CONCURRENT") ?? readEnv("MAX_CONCURRENT_JUDGES") ?? "3";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

export function getJudgeTimeoutSeconds(): number {
  const raw = readEnv("JUDGE_TIMEOUT_SECONDS") ?? "120";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

export function getMaxUploadBytes(): number {
  const raw = readEnv("MAX_UPLOAD_BYTES") ?? `${10 * 1024 * 1024}`;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 1024 * 1024;
}

export function getWorkerPollMs(): number {
  const raw = readEnv("WORKER_POLL_MS") ?? "1000";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}
