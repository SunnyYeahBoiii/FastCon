export const FLOW_CHUNK_SIZE_BYTES = 50 * 1024 * 1024;
export const FLOW_SIMULTANEOUS_UPLOADS = 10;

export interface FlowUploadCompleteResponse<TQuota = unknown> {
  ok?: boolean;
  complete?: boolean;
  submissionId?: string;
  uploadReceivedBytes?: number;
  uploadTotalBytes?: number;
  quota?: TQuota | null;
  error?: string;
  code?: string;
}

// eslint-disable-next-line no-unused-vars
type UploadProgressCallback = (progress: number) => void;

export interface UploadWithFlowOptions {
  completeUrl: string;
  contestId: string;
  file: File;
  onProgress: UploadProgressCallback;
  targetUrl: string;
}

function sanitizeFlowIdentifierPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

export function flowIdentifierForFile(contestId: string, file: File) {
  return [
    "fast-con",
    sanitizeFlowIdentifierPart(contestId),
    file.size.toString(),
    file.lastModified.toString(),
    sanitizeFlowIdentifierPart(file.name),
  ].join("-");
}

function readFlowJsonResponse<TQuota>(text: string): FlowUploadCompleteResponse<TQuota> {
  if (!text) return {};

  try {
    return JSON.parse(text) as FlowUploadCompleteResponse<TQuota>;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export async function uploadSubmissionFileWithFlow<TQuota = unknown>({
  completeUrl,
  contestId,
  file,
  onProgress,
  targetUrl,
}: UploadWithFlowOptions): Promise<{
  ok: boolean;
  data: FlowUploadCompleteResponse<TQuota> | null;
}> {
  const { default: Flow } = await import("@flowjs/flow.js");
  const flowIdentifier = flowIdentifierForFile(contestId, file);
  const totalChunks = Math.max(1, Math.ceil(file.size / FLOW_CHUNK_SIZE_BYTES));

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (result: { ok: boolean; data: FlowUploadCompleteResponse<TQuota> | null }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const flow = new Flow({
      target: targetUrl,
      chunkSize: FLOW_CHUNK_SIZE_BYTES,
      forceChunkSize: true,
      simultaneousUploads: FLOW_SIMULTANEOUS_UPLOADS,
      testChunks: true,
      testMethod: "GET",
      uploadMethod: "PUT",
      method: "octet",
      withCredentials: true,
      maxChunkRetries: 3,
      chunkRetryInterval: 1000,
      progressCallbacksInterval: 250,
      successStatuses: [200, 201, 202],
      permanentErrors: [400, 401, 403, 404, 413, 415, 422, 500, 501],
      generateUniqueIdentifier: () => flowIdentifier,
    });

    if (!flow.support) {
      fail(new Error("Trình duyệt không hỗ trợ upload theo chunks."));
      return;
    }

    flow.on("fileProgress", (flowFile) => {
      onProgress(Math.min(99, Math.round(flowFile.progress() * 100)));
    });

    flow.on("fileError", (_flowFile, message) => {
      fail(new Error(message || "Upload failed"));
    });

    flow.on("fileSuccess", async () => {
      try {
        const response = await fetch(completeUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowTotalChunks: totalChunks,
            flowChunkSize: FLOW_CHUNK_SIZE_BYTES,
            flowTotalSize: file.size,
            flowIdentifier,
            flowFilename: file.name,
          }),
        });
        const data = readFlowJsonResponse<TQuota>(await response.text());
        if (!response.ok || data.ok === false) {
          settle({ ok: false, data });
          return;
        }
        onProgress(100);
        settle({ ok: true, data });
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Upload failed"));
      }
    });

    onProgress(0);
    flow.addFile(file);
    flow.upload();
  });
}
