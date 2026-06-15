import { prisma } from '@/lib/prisma'
import type { WorkflowNode, WorkflowRunContext, NodeExecutionResult, NodeHandler } from './dag-types'

type RunWorkflowFn = (
  workflowId: string,
  input?: Record<string, unknown>,
  options?: {
    parentRunId?: string
    depth?: number
    maxDepth?: number
    trigger?: any
    handlers?: Record<string, NodeHandler>
  }
) => Promise<{ runId: string; status: any; output: unknown }>

/**
 * 创建子流程 NodeHandler。
 * 采用依赖注入以避免与 dag-runner.ts 的循环引用。
 */
export function createSubworkflowHandler(runWorkflow: RunWorkflowFn): NodeHandler {
  return async (node: WorkflowNode, execCtx: WorkflowRunContext): Promise<NodeExecutionResult> => {
    const config = node.config ?? {}
    const childWorkflowId = typeof config.workflowId === 'string' ? config.workflowId : null

    if (!childWorkflowId) {
      return {
        status: 'failed',
        error: `子流程节点 ${node.id} 缺少 config.workflowId 配置`,
      }
    }

    try {
      // 1. 强安全隔离校验（多租户数据沙箱）
      const childWf = await prisma.workflow.findUnique({
        where: { id: childWorkflowId },
        select: { workspaceId: true },
      })

      if (!childWf) {
        return {
          status: 'failed',
          error: `子流程节点 ${node.id} 加载失败：目标工作流 ${childWorkflowId} 不存在`,
        }
      }

      if (childWf.workspaceId !== execCtx.workspaceId) {
        return {
          status: 'failed',
          error: `安全阻断：子工作流 (Workspace: ${childWf.workspaceId}) 与父工作流租户不一致 (Workspace: ${execCtx.workspaceId})`,
          riskLevel: 'high', // 提升为高风险审计项
        }
      }

      // 2. 准备子流程的输入变量（继承当前 variables + 上游节点 outputs，排除内部 __skipped__ 键）
      const childInput: Record<string, unknown> = { ...execCtx.variables }
      for (const [key, val] of Object.entries(execCtx.nodeOutputs)) {
        if (key.startsWith('__skipped__')) continue
        if (val === null || val === undefined) continue
        childInput[key] = val
      }

      // 3. 递归执行子流程
      const childResult = await runWorkflow(childWorkflowId, childInput, {
        parentRunId: execCtx.runId,
        depth: execCtx.depth + 1,
        trigger: 'subworkflow',
      })

      return {
        status: childResult.status === 'completed' ? 'completed' : 'failed',
        output: childResult.output,
        error: childResult.status === 'failed' ? '子工作流执行失败' : undefined,
      }
    } catch (error) {
      return {
        status: 'failed',
        error: `子流程 ${childWorkflowId} 执行异常：${error instanceof Error ? error.message : '未知错误'}`,
      }
    }
  }
}
