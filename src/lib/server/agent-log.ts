/**
 * 执行日志写入工具（AGENTS.md 第四章 4.4 闭环反馈 / 第五章「无日志的执行属违规」）
 *
 * —— 所有真实执行（Hermes 对话、快捷任务、智能体任务）须在结束后留下运行日志，
 *    供 Harness Level 2 评估引擎读取（src/lib/server/harness-eval.ts）。
 *
 * ⚠️ 仅在服务端调用；写日志失败不得阻断主流程，故全程 try/catch 静默吞错。
 */
import { prisma } from "@/lib/prisma"

/** 执行来源：agent（绑定智能体）| hermes-chat（控制面对话）| quick-task（快捷任务）| hermes-suggestions（今日建议）| workflow（DAG 工作流节点） */
export type AgentLogSource = "agent" | "hermes-chat" | "quick-task" | "hermes-suggestions" | "workflow"

export interface WriteAgentLogInput {
  /** 绑定的智能体 ID；控制面 / 快捷任务无绑定时为空 */
  agentId?: string | null
  source: AgentLogSource
  taskName: string
  /** success | error | timeout ...（评估引擎兼容中英文失败写法） */
  status: string
  /** 耗时文本，如 "1.2s" */
  duration: string
  detail?: string
  /** 风险等级（AGENTS.md §4.4 闭环反馈 / §4.7 自动化授权）：low | medium | high */
  riskLevel?: string
}

/**
 * 写入一条运行日志。失败仅打印告警，不抛出。
 */
export async function writeAgentLog(input: WriteAgentLogInput): Promise<void> {
  try {
    await prisma.agentLog.create({
      data: {
        id: crypto.randomUUID(),
        agentId: input.agentId ?? null,
        source: input.source,
        taskName: input.taskName,
        status: input.status,
        duration: input.duration,
        detail: input.detail ?? null,
        riskLevel: input.riskLevel ?? null,
      },
    })
  } catch (error) {
    console.warn("[writeAgentLog] 运行日志写入失败（已忽略）：", error)
  }
}
