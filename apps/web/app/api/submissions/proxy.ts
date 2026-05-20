import { NextResponse } from "next/server";
import { getFastApiInternalUrl } from "@/lib/runtimeConfig";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function submissionTargetUrl(pathParts: string[], requestUrl: string): string | null {
  const fastApiInternalUrl = getFastApiInternalUrl();
  if (!fastApiInternalUrl) return null;

  const sourceUrl = new URL(requestUrl);
  const encodedPath = pathParts.map((part) => encodeURIComponent(part)).join("/");
  const pathname = encodedPath ? `/api/submissions/${encodedPath}` : "/api/submissions";
  const targetUrl = new URL(pathname, fastApiInternalUrl);
  targetUrl.search = sourceUrl.search;
  return targetUrl.toString();
}

export async function proxySubmissionRequest(
  request: Request,
  pathParts: string[] = []
): Promise<Response> {
  const targetUrl = submissionTargetUrl(pathParts, request.url);
  if (!targetUrl) {
    return NextResponse.json(
      { ok: false, error: "FASTAPI_INTERNAL_URL is not configured" },
      { status: 503 }
    );
  }

  const init = {
    method: request.method,
    headers: copyRequestHeaders(request),
    redirect: "manual",
  } as Parameters<typeof fetch>[1] & { duplex?: "half" };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
    init.duplex = "half";
  }

  const response = await fetch(targetUrl, init);
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyResponseHeaders(response),
  });
}
