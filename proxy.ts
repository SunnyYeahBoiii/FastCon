import { NextRequest, NextResponse } from "next/server";

const NGROK_HOST_SUFFIXES = [".ngrok-free.app", ".ngrok.app"];

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;

  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
    return true;
  }

  try {
    const host = new URL(origin).hostname;
    return NGROK_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

function applyCorsHeaders(response: NextResponse, origin: string | null) {
  if (isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  const configuredOrigin = process.env.CORS_ORIGIN;
  if (configuredOrigin && origin === configuredOrigin) {
    response.headers.set("Access-Control-Allow-Origin", configuredOrigin);
    response.headers.set("Vary", "Origin");
  }
}

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response, origin);
    return response;
  }

  const response = NextResponse.next();
  applyCorsHeaders(response, origin);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
