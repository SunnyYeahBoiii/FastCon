import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

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

    if (pollInterval) clearInterval(pollInterval);
    if (timeoutId) clearTimeout(timeoutId);
    if (heartbeatId) clearInterval(heartbeatId);
    if (unsub) unsub();

    pollInterval = null;
    timeoutId = null;
    heartbeatId = null;
    unsub = null;
  };

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
