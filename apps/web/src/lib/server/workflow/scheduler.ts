/**
 * 统一工作流执行调度器
 *
 * 职责：
 * 1. 统一工作流执行入口，路由决定是本地 DAG 执行还是远程 Hermes 执行。
 * 2. 依据环境变量 WORKFLOW_ROUTING_MODE 及 WorkspaceSettings 进行配置决定。
 * 3. 拦截和检验关键任务输入参数是否符合 TypedTaskInputSchema 约束。
 * 4. 统一记录执行相关的 AuditLog 和 AgentLog，确保操作留轨（满足「无日志禁止静默执行」安全红线）。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import type { AuditRiskLevel } from "@/types"
import { writeAgentLog } from "@/lib/server/agent-log"
import { hermesClient } from "@/lib/server/adapters/hermes"
// LEGACY ENGINE ROUTE: Operating on WorkflowNodeRun table.
import { runWorkflow as runLocalWorkflow } from "@/lib/server/workflow/dag-runner"
import { TypedTaskInputSchema } from "@hermesclaw/event-contracts"
import { isCriticalActionType } from "@/lib/server/check-automation-gate"
import { TRADE_CRITICAL_ACTION_TYPES } from "@foreign-trade/policy/critical-actions"
import { TaskInputValidationError, HermesApiError } from "@/lib/server/exceptions"

export interface ScheduleOptions {
  /** 工作流 ID */
  workflowId: string
  /** 工作流输入数据 */
  inputs?: Record<string, unknown>
  /** 工作空间 ID */
  workspaceId: string
  /** 关联的项目 ID (可选) */
  projectId?: string
  /** 关联的智能体 ID (可选) */
  agentId?: string
}

export interface ScheduleResult {
  /** 运行实例或执行实例 ID */
  runId: string
  /** 运行状态 */
  status: string
  /** 工作流输出结果 */
  output: unknown
  
  // 向后兼容支持字段，以防前端/第三方显式消费底层接口字段
  executionId?: string
  outputs?: unknown
}

export class WorkflowSchedulerService {
  /**
   * 统一执行工作流的主入口。
   *
   * @param options 执行选项，包括工作流、参数、关联上下文
   * @returns 统一封装后的执行结果（含向后兼容字段）
   */
  static async runWorkflow(options: ScheduleOptions): Promise<ScheduleResult> {
    const { workflowId, inputs = {}, workspaceId, projectId, agentId } = options

    // 1. 参数校验：如果属于高危/关键动作，验证输入是否符合 Zod schema
    const actionType = typeof inputs._type === "string" ? inputs._type : ""
    const typedInput = TypedTaskInputSchema.safeParse(inputs)
    if (!typedInput.success && isCriticalActionType(actionType, TRADE_CRITICAL_ACTION_TYPES)) {
      const errorMsg = "任务输入不符合 actionType 要求"
      const validationErrors = typedInput.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      logger.warn(`[WorkflowScheduler] 执行被拦截：${errorMsg}`, {
        workflowId,
        actionType,
        errors: validationErrors,
      })
      throw new TaskInputValidationError(errorMsg, { errors: validationErrors })
    }

    // 2. 路由决定逻辑
    const envMode = process.env.WORKFLOW_ROUTING_MODE
    let engine: "local" | "hermes" = "local"

    if (envMode === "hermes" || envMode === "local") {
      engine = envMode
    } else {
      // workspace 设定决定路由模式，若不存在则使用缺省 'local'
      const settings = await prisma.workspaceSettings.findUnique({
        where: { workspaceId },
      })
      engine = (settings?.workflowEngine as "local" | "hermes") || "local"
    }

    logger.info(`[WorkflowScheduler] 工作流 ${workflowId} 路由决定为: ${engine} 执行器`, {
      workspaceId,
      engine,
      envMode,
    })

    // 3. 动态审计风险级别确定：若 actionType 为高危类型则为 high，否则默认为 medium
    const auditRisk: AuditRiskLevel = isCriticalActionType(actionType, TRADE_CRITICAL_ACTION_TYPES) ? "high" : "medium"

    // 4. 路由分发与执行
    if (engine === "hermes") {
      try {
        const body = {
          workflowId,
          inputs,
          projectId,
          agentId,
        }

        const result = await hermesClient.runWorkflow(body)

        // 审计留轨：远程执行成功，记录审计日志与 AgentLog
        const actor = await actorFromSession()
        await writeAuditLog({
          actor,
          action: "workflow.run",
          targetType: "workflow",
          targetId: workflowId,
          detail: `通过 Hermes 引擎执行工作流 ${workflowId}`,
          riskLevel: auditRisk,
          workspaceId,
        })

        await writeAgentLog({
          agentId: agentId ?? null,
          source: "workflow",
          taskName: `执行工作流 ${workflowId}`,
          status: "success",
          duration: "0s",
          detail: `通过 Hermes 适配器执行工作流 ${workflowId}`,
          riskLevel: auditRisk,
        })

        return {
          runId: result.executionId,
          executionId: result.executionId,
          status: result.status,
          output: result.outputs ?? {},
          outputs: result.outputs ?? {},
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        logger.error(`[WorkflowScheduler] Hermes 执行工作流失败`, {
          workflowId,
          error: message,
        })

        // 审计留轨：失败时同样需要记录审计与日志，风险级别提升至 high
        try {
          const actor = await actorFromSession()
          await writeAuditLog({
            actor,
            action: "workflow.run.fail",
            targetType: "workflow",
            targetId: workflowId,
            detail: `工作流远程执行失败：${message.slice(0, 200)}`,
            riskLevel: "high",
            workspaceId,
          })
          await writeAgentLog({
            agentId: agentId ?? null,
            source: "workflow",
            taskName: `执行工作流 ${workflowId}`,
            status: "failed",
            duration: "0s",
            detail: `Hermes 适配器执行失败：${message.slice(0, 200)}`,
            riskLevel: "high",
          })
        } catch (auditError) {
          logger.error("[WorkflowScheduler] 审计日志记录异常", {
            error: auditError instanceof Error ? auditError.message : "未知",
          })
        }
        throw new HermesApiError(`Hermes 执行工作流失败：${message}`)
      }
    } else {
      // 本地 DAG 引擎执行
      // 本地执行器 dag-runner 会在其生命周期钩子中自动处理节点级 AuditLog 和 AgentLog
      try {
        const localInputs = {
          ...inputs,
          ...(agentId ? { agentId } : {}),
          ...(projectId ? { projectId } : {}),
        }
        // LEGACY ROUTE: Using deprecated local workflow runner.
        const result = await runLocalWorkflow(workflowId, localInputs)
        return {
          runId: result.runId,
          status: result.status,
          output: result.output,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        logger.error(`[WorkflowScheduler] 本地 DAG 引擎执行工作流失败`, {
          workflowId,
          error: message,
        })
        throw error
      }
    }
  }
}

