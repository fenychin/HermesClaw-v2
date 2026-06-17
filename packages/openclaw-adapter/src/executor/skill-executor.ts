/**
 * Skill Executor — 技能执行（OpenClaw Execution Runtime 域）
 *
 * 职责（CLAUDE.md §5）：
 * 1. 接收已校验的 Skill 数据（不直接读 DB）；
 * 2. 在受控环境下执行技能（v0.x 阶段为配置校验 + 输入/输出 schema 解析，
 *    真实模型调用通过 deps.runModel 注入；不在此包内实现 LLM 路由）；
 * 3. 通过 deps 输出 ExecutionEvent / Receipt（依赖注入，不耦合 prisma）。
 *
 * 边界：
 * - 不读写数据库（由调用方注入数据）；
 * - 不调用 LLM Provider（由 runModel deps 注入）；
 * - 不做 L1-L4 决策（由 Hermes Kernel 在外层完成）。
 */

import type { ExecutionEvent } from '@hermesclaw/event-contracts'

/**
 * 已加载的 Skill 数据（与 Prisma Skill 兼容的最小结构）。
 * 调用方负责从存储层读取并传入。
 */
export interface SkillRecord {
  id: string
  name: string
  automationLevel: string
  version: string
  status: string
  inputSchema: string  // JSON 字符串
  outputSchema: string // JSON 字符串
  scenarios: string    // JSON 字符串
}

/**
 * 技能测试输入。
 */
export interface SkillTestInput {
  skill: SkillRecord
  taskId?: string
  workflowRunId?: string
}

/**
 * Skill 执行依赖注入。
 *
 * 全部为可选（默认实现走纯计算路径，便于单测）。
 */
export interface SkillExecutorDeps {
  /** JSON 字段解析；默认 JSON.parse + try/catch fallback。 */
  parseJsonField?: (raw: unknown, fallback: unknown) => unknown
  /** 事件发射器（可选）；用于将测试事件接入 ExecutionBus。 */
  emitEvent?: (event: ExecutionEvent) => void
}

export interface SkillTestResult {
  skillId: string
  skillName: string
  automationLevel: string
  version: string
  status: string
  inputSchemaKeys: number
  outputSchemaKeys: number
  scenarioCount: number
  passed: boolean
}

const defaultParseJsonField = (raw: unknown, fallback: unknown): unknown => {
  if (raw == null) return fallback
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/**
 * 执行技能"测试运行"。
 *
 * 当前阶段实现：解析 inputSchema / outputSchema / scenarios 字段，
 * 校验技能配置完整性（status === "active"），返回 testSummary。
 * 真实调用 LLM 的版本由 Hermes Kernel 编排后注入 runModel deps（未来扩展）。
 */
export async function executeSkillTest(
  input: SkillTestInput,
  deps: SkillExecutorDeps = {},
): Promise<SkillTestResult> {
  const parse = deps.parseJsonField ?? defaultParseJsonField
  const skill = input.skill

  const parsedInput = (parse(skill.inputSchema, {}) ?? {}) as Record<string, unknown>
  const parsedOutput = (parse(skill.outputSchema, {}) ?? {}) as Record<string, unknown>
  const parsedScenarios = (parse(skill.scenarios, []) ?? []) as unknown[]

  const result: SkillTestResult = {
    skillId: skill.id,
    skillName: skill.name,
    automationLevel: skill.automationLevel,
    version: skill.version,
    status: skill.status,
    inputSchemaKeys: Object.keys(parsedInput || {}).length,
    outputSchemaKeys: Object.keys(parsedOutput || {}).length,
    scenarioCount: Array.isArray(parsedScenarios) ? parsedScenarios.length : 0,
    passed: skill.status === 'active',
  }

  // 可选：广播 ExecutionEvent（仅当外部注入了 emitEvent）
  if (deps.emitEvent && input.taskId && input.workflowRunId) {
    const ts = new Date().toISOString()
    deps.emitEvent({
      eventId: `evt-skill-test-${input.taskId}`,
      taskId: input.taskId,
      workflowRunId: input.workflowRunId,
      runtimeId: 'openclaw-runtime',
      eventType: result.passed ? 'run.completed' : 'run.failed',
      status: result.passed ? 'completed' : 'failed',
      timestamp: ts,
      payload: {
        message: `Skill 测试 ${result.passed ? '通过' : '失败'}: ${skill.name}`,
        ...(result as unknown as Record<string, unknown>),
      },
      version: '1.0.0',
    } as ExecutionEvent)
  }

  return result
}
