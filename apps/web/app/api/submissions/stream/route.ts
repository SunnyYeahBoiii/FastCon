import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";
import { getSessionUser } from "@/lib/session";

export const maxDuration = 60;

const globalForSse = global as typeof globalThis & {
  __sseShutdownRegistered?: boolean;
};

// Global registry for active SSE streams
const activeStreams = new Set<{
  enqueue: (data: string) => void;
  close: () => void;
  userId: string;
}>();

// Shutdown handler (registered once)
if (!globalForSse.__sseShutdownRegistered) {
  globalForSse.__sseShutdownRegistered = true;
  const shutdown = (signal: string) => {
    console.log(`[SSE] Server shutting down (${signal}), notifying ${activeStreams.size} clients`);
    for (const stream of activeStreams) {
      stream.enqueue(`event: shutdown\ndata: Server shutting down\n\n`);
      stream.close();
    }
    activeStreams.clear();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedUserId = searchParams.get("userId");
  if (requestedUserId && requestedUserId !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = currentUser.id;

  const submissions = await prisma.submission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      contest: { select: { id: true, title: true } },
    },
  });

  const encoder = new TextEncoder();

  let closed = false;
  let pollInterval: NodeJS.Timeout | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  let heartbeatId: NodeJS.Timeout | null = null;
  let unsub: (() => void) | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    activeStreams.delete(streamHandle);

    if (pollInterval) clearInterval(pollInterval);
    if (timeoutId) clearTimeout(timeoutId);
    if (heartbeatId) clearInterval(heartbeatId);
    if (unsub) unsub();

    pollInterval = null;
    timeoutId = null;
    heartbeatId = null;
    unsub = null;
  };

  let streamHandle: { enqueue: (data: string) => void; close: () => void; userId: string };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };

      const safeClose = () => {
        if (closed) return;
        cleanup();
        try {
          controller.close();
        } catch {}
      };

      streamHandle = { enqueue: safeEnqueue, close: safeClose, userId };
      activeStreams.add(streamHandle);

      // Initial state
      safeEnqueue(
        `event: initial\ndata: ${JSON.stringify({ submissions })}\n\n`
      );

      // Subscribe to real-time events
      unsub = subscribe(`user:${userId}`, (rawData) => {
        if (closed) return;
        const data = rawData as Record<string, unknown>;
        safeEnqueue(
          `event: update\ndata: ${JSON.stringify(data)}\n\n`
        );
      });

      // Poll fallback every 15s
      pollInterval = setInterval(async () => {
        if (closed) return;

        try {
          const updated = await prisma.submission.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
              contest: { select: { id: true, title: true } },
            },
          });

          safeEnqueue(
            `event: poll_update\ndata: ${JSON.stringify({ submissions: updated })}\n\n`
          );
        } catch (err) {
          if (!closed) {
            console.error("SSE submission poll error:", err);
          }
        }
      }, 15000);

      // Heartbeat to prevent proxy idle timeout
      heartbeatId = setInterval(() => {
        safeEnqueue(`: keep-alive\n\n`);
      }, 15000);

      // Auto-close after 55s, client will reconnect
      timeoutId = setTimeout(() => {
        safeClose();
      }, 55000);

      request.signal.addEventListener("abort", cleanup);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
