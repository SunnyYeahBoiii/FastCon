import { proxySubmissionRequest } from "../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    path?: string[];
  };
}

function pathParts(context: RouteContext): string[] {
  return context.params.path ?? [];
}

export function GET(request: Request, context: RouteContext) {
  return proxySubmissionRequest(request, pathParts(context));
}

export function POST(request: Request, context: RouteContext) {
  return proxySubmissionRequest(request, pathParts(context));
}

export function PUT(request: Request, context: RouteContext) {
  return proxySubmissionRequest(request, pathParts(context));
}

export function PATCH(request: Request, context: RouteContext) {
  return proxySubmissionRequest(request, pathParts(context));
}

export function DELETE(request: Request, context: RouteContext) {
  return proxySubmissionRequest(request, pathParts(context));
}

export function HEAD(request: Request, context: RouteContext) {
  return proxySubmissionRequest(request, pathParts(context));
}
