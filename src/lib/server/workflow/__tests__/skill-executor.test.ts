/**
 * Skill 执行器安全回归测试 —— 聚焦 ToolGrant 授权校验的 fail-closed 行为。
 *
 * 覆盖 CLAUDE.md §10「高危动作须覆盖拒绝路径」：
 *   - 高危工具缺少 ToolGrant → 抛 ToolGrantMissingException（拒绝路径）
 *   - 高危(high)工具双签不足 → 抛 ToolGrantMissingException（拒绝路径）
 *   - 授权校验链路非预期异常（DB 抖动）→ fail-closed 拒绝执行（绝不放行）
 *   - ToolGrant 校验通过 → 正常分发到 OpenClaw（放行路径）
 *   - 损坏的 scopes JSON 不导致解析抛错而反向放行
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { openclawClient } from '@/lib/server/adapters/openclaw/client'
import { executeSkillNode } from '../skill-executor'
import { ToolGrantMissingException } from '@/lib/server/exceptions'
import type { WorkflowNode, WorkflowRunContext } from '../dag-types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    skill: { findUnique: vi.fn() },
    harnessProposal: { findFirst: vi.fn() },
    toolRegistry: { findFirst: vi.fn() },
    toolGrant: { findFirst: vi.fn() },
    workflow: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/server/adapters/openclaw/client', () => ({
  openclawClient: { executeTask: vi.fn() },
}))

// agent-log 写入与本测试无关，stub 掉避免触达真实 DB
vi.mock('@/lib/server/agent-log', () => ({
  writeAgentLog: vi.fn().mockResolvedValue(undefined),
}))

const ACTIVE_L2_SKILL = {
  id: 'skill-1',
  name: 'send-quote',
  description: '生成报价',
  version: '1.0.0',
  category: 'trade',
  automationLevel: 'L2',
  status: 'active',
  workspaceId: 'ws-1',
}

function createContext(): WorkflowRunContext {
  return {
    runId: 'run-1',
    workflowId: 'wf-1',
    trigger: 'manual',
    variables: { agentId: 'agent-1' },
    nodeOutputs: {},
    actor: 'admin',
    depth: 0,
    workspaceId: 'ws-1',
    industryId: 'foreign-trade',
  }
}

const node: WorkflowNode = {
  id: 'skill-node',
  kind: 'skill',
  name: 'Skill Node',
  config: { skillId: 'skill-1' },
}

describe('Skill 执行器 —— ToolGrant 授权 fail-closed 安全回归', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认：skill 加载成功、active、租户匹配
    vi.mocked(prisma.skill.findUnique).mockResolvedValue(ACTIVE_L2_SKILL as any)
    // 默认：workflow 带 industryId（避免 MissingIndustryIdError 干扰）
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue({ industryId: 'foreign-trade' } as any)
  })

  it('高危工具缺少 ToolGrant → 抛 ToolGrantMissingException（拒绝路径）', async () => {
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue({
      id: 'tool-1',
      name: 'send-quote',
      riskLevel: 'high',
      scopes: '["email:send"]',
      enabled: true,
    } as any)
    vi.mocked(prisma.toolGrant.findFirst).mockResolvedValue(null) // 无授权

    await expect(executeSkillNode(node, createContext())).rejects.toBeInstanceOf(
      ToolGrantMissingException,
    )
    // 绝对不可分发到执行面
    expect(openclawClient.executeTask).not.toHaveBeenCalled()
  })

  it('高危(high)工具双签不足 → 抛 ToolGrantMissingException（拒绝路径）', async () => {
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue({
      id: 'tool-1',
      name: 'send-quote',
      riskLevel: 'high',
      scopes: '["email:send"]',
      enabled: true,
    } as any)
    // grant 存在但只有一个签字
    vi.mocked(prisma.toolGrant.findFirst).mockResolvedValue({
      id: 'grant-1',
      approvedBy1: 'alice',
      approvedBy2: null,
    } as any)

    await expect(executeSkillNode(node, createContext())).rejects.toBeInstanceOf(
      ToolGrantMissingException,
    )
    expect(openclawClient.executeTask).not.toHaveBeenCalled()
  })

  it('授权校验链路非预期异常（DB 抖动）→ fail-closed 拒绝执行，绝不放行', async () => {
    // 受控工具，但 toolGrant 查询直接抛错（模拟 DB 抖动）
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue({
      id: 'tool-1',
      name: 'send-quote',
      riskLevel: 'medium',
      scopes: '["email:send"]',
      enabled: true,
    } as any)
    vi.mocked(prisma.toolGrant.findFirst).mockRejectedValue(new Error('connection reset'))

    const result = await executeSkillNode(node, createContext())

    expect(result.status).toBe('failed')
    expect(result.riskLevel).toBe('high')
    expect(result.error).toContain('fail-closed')
    // 关键断言：校验系统自身故障时绝不放行高危工具
    expect(openclawClient.executeTask).not.toHaveBeenCalled()
  })

  it('损坏的 scopes JSON 不导致解析抛错而反向放行（仍走拒绝路径）', async () => {
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue({
      id: 'tool-1',
      name: 'send-quote',
      riskLevel: 'high',
      scopes: '{not-valid-json', // 损坏的 JSON
      enabled: true,
    } as any)
    vi.mocked(prisma.toolGrant.findFirst).mockResolvedValue(null)

    // 应当抛出授权缺失异常（而非 JSON.parse 抛出的 SyntaxError 被 fail-closed 吞成普通失败）
    await expect(executeSkillNode(node, createContext())).rejects.toBeInstanceOf(
      ToolGrantMissingException,
    )
    expect(openclawClient.executeTask).not.toHaveBeenCalled()
  })

  it('ToolGrant 校验通过 → 正常分发到 OpenClaw（放行路径）', async () => {
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue({
      id: 'tool-1',
      name: 'send-quote',
      riskLevel: 'high',
      scopes: '["email:send"]',
      enabled: true,
    } as any)
    // 完整双签的有效授权
    vi.mocked(prisma.toolGrant.findFirst).mockResolvedValue({
      id: 'grant-1',
      approvedBy1: 'alice',
      approvedBy2: 'bob',
    } as any)
    vi.mocked(openclawClient.executeTask).mockResolvedValue({
      outcome: 'success',
      response: { confidence: 0.9 },
    } as any)

    const result = await executeSkillNode(node, createContext())

    expect(result.status).toBe('completed')
    expect(openclawClient.executeTask).toHaveBeenCalledTimes(1)
  })

  it('非受控工具（未注册 ToolRegistry）→ 不触发授权门禁，正常放行', async () => {
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue(null) // 未注册
    vi.mocked(openclawClient.executeTask).mockResolvedValue({
      outcome: 'success',
      response: { confidence: 0.9 },
    } as any)

    const result = await executeSkillNode(node, createContext())

    expect(result.status).toBe('completed')
    expect(prisma.toolGrant.findFirst).not.toHaveBeenCalled()
    expect(openclawClient.executeTask).toHaveBeenCalledTimes(1)
  })
})

describe('Skill 执行器 —— L3 审批门禁（targetSkillId 关联修复回归）', () => {
  const L3_SKILL = { ...ACTIVE_L2_SKILL, id: 'skill-l3', name: 'auto-outreach', automationLevel: 'L3' }
  const l3Node: WorkflowNode = {
    id: 'skill-node-l3',
    kind: 'skill',
    name: 'L3 Skill Node',
    config: { skillId: 'skill-l3' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.skill.findUnique).mockResolvedValue(L3_SKILL as any)
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue({ industryId: 'foreign-trade' } as any)
    // 非受控工具，隔离 ToolGrant 干扰，聚焦 L3 门禁
    vi.mocked(prisma.toolRegistry.findFirst).mockResolvedValue(null)
  })

  it('L3 技能无已审批提案 → 拒绝执行（修复前因查询字段错误而恒为空 → 恒拒绝）', async () => {
    vi.mocked(prisma.harnessProposal.findFirst).mockResolvedValue(null)

    const result = await executeSkillNode(l3Node, createContext())

    expect(result.status).toBe('failed')
    expect(result.error).toContain('需人工确认')
    expect(openclawClient.executeTask).not.toHaveBeenCalled()
    // 关键：门禁查询必须用 targetSkillId 关联，而非 targetComponent
    expect(prisma.harnessProposal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'approved',
          workspaceId: 'ws-1',
          targetSkillId: 'skill-l3',
        }),
      }),
    )
  })

  it('L3 技能有已审批提案（targetSkillId 匹配）→ 正常放行（修复前永远无法走到这条路径）', async () => {
    vi.mocked(prisma.harnessProposal.findFirst).mockResolvedValue({
      proposalId: 'HEP-approved-1',
    } as any)
    vi.mocked(openclawClient.executeTask).mockResolvedValue({
      outcome: 'success',
      response: { confidence: 0.9 },
    } as any)

    const result = await executeSkillNode(l3Node, createContext())

    expect(result.status).toBe('completed')
    expect(openclawClient.executeTask).toHaveBeenCalledTimes(1)
  })
})
