import { NextRequest } from "next/server"
import { subscribeExecutionEvents, createExecutionEvent } from "@hermesclaw/openclaw-adapter"
import { ExecutionEventSchema } from "@hermesclaw/event-contracts"; import crypto from "crypto"

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params; const encoder = new TextEncoder(); let unsubscribe: (() => void) | null = null
  const stream = new ReadableStream({
    start(controller) {
      const created = ExecutionEventSchema.parse(createExecutionEvent({ taskId, workflowRunId: `run-${crypto.randomUUID()}`, runtimeId: "openclaw-runtime", eventType: "run.created", status: "started", payload: { message: "SSE connected" } }))
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
