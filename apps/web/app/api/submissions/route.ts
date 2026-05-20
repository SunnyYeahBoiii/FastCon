import { proxySubmissionRequest } from "./proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return proxySubmissionRequest(request);
}

export function POST(request: Request) {
  return proxySubmissionRequest(request);
}

export function PUT(request: Request) {
  return proxySubmissionRequest(request);
}

export function PATCH(request: Request) {
  return proxySubmissionRequest(request);
}

export function DELETE(request: Request) {
  return proxySubmissionRequest(request);
}

export function HEAD(request: Request) {
  return proxySubmissionRequest(request);
}
