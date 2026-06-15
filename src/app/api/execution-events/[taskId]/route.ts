import { NextRequest } from "next/server"
import { subscribeExecutionEvents } from "@/lib/server/adapters/openclaw/execution-bus"
import { ExecutionEventSchema, type ExecutionEvent } from "@/contracts/execution-event"
import crypto from "crypto"

/**
 * GET /api/execution-events/[taskId]
 * 
 * 建立 SSE (Server-Sent Events) 长连接订阅任务执行轨迹。
 * 
 * 规范与契约要求：
 * - GET 请求建立 SSE 链接
 * - 连接建立时立即发送一个合规的 run.created 事件
 * - 终态（run.completed / run.failed 等）事件发送完毕后自动关闭连接
 * - 所有发送的事件均使用 ExecutionEventSchema.parse() 进行 Zod 强校验
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const taskId = params.taskId;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      try {
        // 1. 连接建立时首先发送 run.created 事件
        const createdEvent: ExecutionEvent = {
          eventId: `evt-${crypto.randomUUID()}`,
          taskId,
          workflowRunId: `run-${crypto.randomUUID()}`,
          runtimeId: "openclaw-runtime",
          eventType: "run.created",
          status: "started",
          timestamp: new Date().toISOString(),
          payload: {
            message: "SSE connection established successfully",
          },
          version: "1.0.0",
        };

        const validatedCreated = ExecutionEventSchema.parse(createdEvent);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(validatedCreated)}\n\n`));

        // 2. 订阅执行总线事件
        unsubscribe = subscribeExecutionEvents(taskId, (event) => {
          try {
            const validated = ExecutionEventSchema.parse(event);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(validated)}\n\n`));

            // 3. 执行完成时，断开连接并自动卸载订阅，防止挂载积压
            if (
              validated.eventType === "run.completed" ||
              validated.eventType === "run.failed" ||
              validated.eventType === "run.cancelled"
            ) {
              if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
              }
              controller.close();
            }
          } catch (err) {
            console.error("[SSE Route] 订阅事件推送/校验失败:", err);
          }
        });
      } catch (err) {
        console.error("[SSE Route] 初始化连接建立阶段发生异常:", err);
        controller.error(err);
      }
    },
    cancel() {
      // 客户端主动断连时的资源释放
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
