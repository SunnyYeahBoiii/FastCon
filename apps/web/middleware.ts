import { NextRequest, NextResponse } from "next/server";

function getFastApiInternalUrl(): string | null {
  const raw =
    process.env.FASTAPI_INTERNAL_URL?.trim() ||
    process.env.JUDGE_SERVICE_URL?.trim();
  if (!raw) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function middleware(request: NextRequest) {
  const fastApiInternalUrl = getFastApiInternalUrl();
  if (!fastApiInternalUrl) {
    return NextResponse.next();
  }

  const targetUrl = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    fastApiInternalUrl
  );
  return NextResponse.rewrite(targetUrl);
}

export const config = {
  matcher: [
    "/api/leaderboard/:path*",
    "/cs116.khtn/api/leaderboard/:path*",
  ],
};
