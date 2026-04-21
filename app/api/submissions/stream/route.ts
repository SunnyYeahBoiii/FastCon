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
    include: {
      contest: { select: { id: true, title: true } },
    },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial state
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "initial", submissions })}\n\n`
        )
      );

      // Subscribe to user events
      const unsub = subscribe(`user:${userId}`, (rawData) => {
        const data = rawData as Record<string, unknown>;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "update", ...data })}\n\n`)
        );
      });

      // Poll for any missed updates as safety net
      const pollInterval = setInterval(async () => {
        try {
          const updated = await prisma.submission.findMany({
            where: { userId },
            include: {
              contest: { select: { id: true, title: true } },
            },
            orderBy: { createdAt: "desc" },
          });

          if (updated.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "poll_update", submissions: updated })}\n\n`
              )
            );
          }
        } catch (err) {
          console.error("SSE submission poll error:", err);
        }
      }, 2000);

      // Auto-close after 55s, client will reconnect
      setTimeout(() => {
        unsub();
        clearInterval(pollInterval);
        controller.close();
      }, 55000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
