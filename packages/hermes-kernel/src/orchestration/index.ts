import type { TaskEnvelope } from '@hermesclaw/event-contracts'

export function createTaskEnvelope(params: Partial<TaskEnvelope>): Partial<TaskEnvelope> {
  return {
    taskId: params.taskId || `t-${Math.random().toString(36).substring(2, 9)}`,
    workflowRunId: params.workflowRunId,
    workspaceId: params.workspaceId,
    ...params
  }
}

export async function orchestrate(
  runOrchestrationFn: (input: any) => Promise<any>,
  checkGateFn: (input: any) => Promise<{ ok: boolean; response?: any }>,
  input: {
    subAgentIds: string[]
    confirm?: boolean
    [key: string]: any
  }
): Promise<{ ok: boolean; response?: any; sessionId?: string }> {
  // 复杂度门禁：subAgentIds > 4 需 checkAutomationGate
  if (input.subAgentIds.length > 4) {
    const gateResult = await checkGateFn({
      automationLevel: 'L3',
      riskLevel: 'high',
      confirmed: input.confirm === true,
      actionName: 'Orchestrator dispatch with > 4 sub-agents'
    })
    if (!gateResult.ok) {
      return { ok: false, response: gateResult.response }
    }
  }

  const sessionId = input.sessionId || `sess-${Math.random().toString(36).substring(2, 9)}`
  
  runOrchestrationFn({
    sessionId,
    workflowRunId: input.workflowRunId || `run-orch-${Math.random().toString(36).substring(2, 9)}`,
    workspaceId: input.workspaceId,
    orchestratorAgentId: input.orchestratorAgentId,
    subAgentIds: input.subAgentIds,
    mode: input.mode || 'sequential',
    goal: input.goal || 'No goal specified',
    inputContext: input.inputContext,
    subInstructions: input.subInstructions,
    createdBy: input.createdBy || 'system'
  }).catch(() => {})

  return { ok: true, sessionId }
}
