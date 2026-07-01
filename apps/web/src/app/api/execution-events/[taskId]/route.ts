import { NextRequest } from "next/server"
import { subscribeExecutionEvents, createExecutionEvent } from "@hermesclaw/openclaw-adapter"
import { ExecutionEventSchema } from "@hermesclaw/event-contracts"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  
  let workflowRun = null
  try {
    workflowRun = await prisma.workflowRun.findFirst({
      where: {
        envelopeSnapshot: {
          path: ['taskId'],
          equals: taskId
        }
      },
      select: {
        id: true,
        runId: true
      }
    })
  } catch (err) {
    console.error(`[execution-events] Failed to query workflowRun for taskId ${taskId}:`, err)
  }

  const resolvedId = workflowRun?.runId ?? workflowRun?.id
  const workflowRunId = resolvedId ?? `pending-${taskId}`
  
  const encoder = new TextEncoder(); let unsubscribe: (() => void) | null = null
  const stream = new ReadableStream({
    start(controller) {
      const created = ExecutionEventSchema.parse(createExecutionEvent({
        taskId,
        workflowRunId,
        runtimeId: "openclaw-runtime",
        eventType: "run.created",
        status: "started",
        payload: {
          message: "SSE connected",
          workflowRunResolved: !!resolvedId
        }
      }))
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(created)}\n\n`))
      unsubscribe = subscribeExecutionEvents(taskId, (event: any) => {
        try {
          const validated = ExecutionEventSchema.parse(event); controller.enqueue(encoder.encode(`data: ${JSON.stringify(validated)}\n\n`))
          if (validated.eventType === "run.completed" || validated.eventType === "run.failed" || validated.eventType === "run.cancelled") { if (unsubscribe) { unsubscribe(); unsubscribe = null } controller.close() }
        } catch {}
      })
    },
    cancel() { if (unsubscribe) { unsubscribe(); unsubscribe = null } },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } })
}
