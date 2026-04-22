import { NextRequest, NextResponse } from "next/server";
import { getFastApiInternalUrl } from "@/lib/runtimeConfig";

export async function proxy(request: NextRequest) {
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
  matcher: ["/api/submissions/:path*", "/api/leaderboard/:path*"],
};
