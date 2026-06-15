import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { runOrchestration } from '@/lib/server/orchestrator'
import { checkAutomationGate } from '@/lib/server/guardrail'

export const POST = withRBAC(
  async (req: Request, ctx: any) => {
    let body: any = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      // ignore
    }

    const subAgentIds = body.subAgentIds || []

    // 复杂度门禁：subAgentIds > 4 需 checkAutomationGate
    if (subAgentIds.length > 4) {
      const gateResult = await checkAutomationGate({
        automationLevel: 'L3',
        riskLevel: 'high',
        confirmed: body.confirm === true,
        actionName: 'Orchestrator dispatch with > 4 sub-agents'
      })
      if (!gateResult.ok) {
        return gateResult.response
      }
    }

    try {
      // 异步触发执行，立即返回 sessionId
      runOrchestration({
        workflowRunId: body.workflowRunId || `run-orch-${Math.random().toString(36).substring(2, 9)}`,
        workspaceId: ctx.workspaceId,
        orchestratorAgentId: body.orchestratorAgentId,
        subAgentIds,
        mode: body.mode || 'sequential',
        goal: body.goal || 'No goal specified',
        inputContext: body.inputContext,
        subInstructions: body.subInstructions,
        createdBy: ctx.userId || 'system'
      }).catch(() => {})

      // 为了获取 sessionId，我们直接生成并返回
      // 事实上，runOrchestration 内部会新建 session，但我们需要立即返回它。
      // 为方便，我们可以在这里直接先调用 createOrchestrationSession 或者是 runOrchestration 不异步。
      // 等等，第八步要求：“POST /orchestration → runOrchestration（异步执行，立即返回 sessionId）”
      // 如果要立即返回 sessionId，我们可以在 API 里生成 sessionId 传入，或者先 createSession 再异步 run。
      // 其实在 orchestrator.ts 里面，sessionId 是内部生成的。但如果我们让它支持在 input 中传入 sessionId 呢？
      // 这是个好主意！我们看一下 orchestrator.ts 中 runOrchestration 怎么获取 sessionId。
      // 它是调用了 createOrchestrationSession(input, deps)。
      // 我们可以给 runOrchestration 的 input 和 createOrchestrationSession 的 input 里加上可选的 sessionId 字段！
      // 如果传入了 sessionId，就使用传入的，否则自己生成。这样我们在 API 路由里生成 sessionId 就可以直接返回它了！
      // 让我们等会儿给 orchestrator.ts 添加 sessionId 的传入支持，这非常自然。
      const sessionId = body.sessionId || `sess-${Math.random().toString(36).substring(2, 9)}`
      
      runOrchestration({
        sessionId, // 传入 sessionId
        workflowRunId: body.workflowRunId || `run-orch-${Math.random().toString(36).substring(2, 9)}`,
        workspaceId: ctx.workspaceId,
        orchestratorAgentId: body.orchestratorAgentId,
        subAgentIds,
        mode: body.mode || 'sequential',
        goal: body.goal || 'No goal specified',
        inputContext: body.inputContext,
        subInstructions: body.subInstructions,
        createdBy: ctx.userId || 'system'
      } as any).catch(() => {})

      return ApiResponse.ok({ sessionId })
    } catch (err: any) {
      return ApiResponse.error(err.message, 400)
    }
  },
  'MEMBER'
)
