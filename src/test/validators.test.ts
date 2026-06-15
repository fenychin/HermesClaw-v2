/**
 * Zod 验证 Schema 测试
 * —— 确保所有 API 输入校验规则正确，防止恶意/非法输入绕过
 */
import { describe, it, expect } from 'vitest'
import {
  AgentCreateSchema,
  ChatMessageSchema,
  ProjectCreateSchema,
  MemoryCreateSchema,
  AgentLogCreateSchema,
} from '@/lib/server/validators'
import { HarnessProposalUpdateSchema } from '@/contracts'

// ==============================
// AgentCreateSchema
// ==============================

describe('AgentCreateSchema', () => {
  it('应该验证合法的 Agent 数据', () => {
    const result = AgentCreateSchema.safeParse({
      name: '外贸销售助手',
      role: '询盘处理与客户跟进',
      description: '负责处理客户询盘',
      source: 'custom',
    })
    expect(result.success).toBe(true)
  })

  it('应该拒绝空名称', () => {
    const result = AgentCreateSchema.safeParse({
      name: '',
      role: 'test',
      description: 'test',
    })
    expect(result.success).toBe(false)
  })

  it('应该拒绝过长的名称（>50字符）', () => {
    const result = AgentCreateSchema.safeParse({
      name: 'a'.repeat(51),
      role: 'test',
      description: 'test',
    })
    expect(result.success).toBe(false)
  })

  it('应该为缺失字段提供默认值', () => {
    const result = AgentCreateSchema.safeParse({
      name: '测试助手',
      role: '测试',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('idle')
      expect(result.data.source).toBe('custom')
      expect(result.data.description).toBe('')
    }
  })

  it('应该拒绝无效的 status 枚举值', () => {
    const result = AgentCreateSchema.safeParse({
      name: 'test',
      role: 'test',
      status: 'invalid-status',
    })
    expect(result.success).toBe(false)
  })
})

// ==============================
// HarnessProposalUpdateSchema（对应 Harness 审批操作）
// ==============================

describe('HarnessProposalUpdateSchema', () => {
  it('应该验证 approve 操作', () => {
    const result = HarnessProposalUpdateSchema.safeParse({
      action: 'approve',
      reviewedBy: 'Admin',
    })
    expect(result.success).toBe(true)
  })

  it('应该验证 reject 操作', () => {
    const result = HarnessProposalUpdateSchema.safeParse({
      action: 'reject',
      reviewedBy: 'Admin',
    })
    expect(result.success).toBe(true)
  })

  it('应该拒绝无效的 action', () => {
    const result = HarnessProposalUpdateSchema.safeParse({
      action: 'delete',
      reviewedBy: 'Admin',
    })
    expect(result.success).toBe(false)
  })

  it('action 为可选字段，空对象可过', () => {
    const result = HarnessProposalUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

// ==============================
// ChatMessageSchema
// ==============================

describe('ChatMessageSchema', () => {
  it('应该验证合法的对话消息', () => {
    const result = ChatMessageSchema.safeParse({
      messages: [{ role: 'user', content: '帮我分析这条询盘' }],
    })
    expect(result.success).toBe(true)
  })

  it('应该拒绝超过 50 轮的对话', () => {
    const messages = Array.from({ length: 51 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: 'test',
    }))
    const result = ChatMessageSchema.safeParse({ messages })
    expect(result.success).toBe(false)
  })

  it('应该拒绝空消息数组', () => {
    const result = ChatMessageSchema.safeParse({ messages: [] })
    expect(result.success).toBe(false)
  })

  it('应该拒绝无效的 role', () => {
    const result = ChatMessageSchema.safeParse({
      messages: [{ role: 'system', content: 'test' }],
    })
    expect(result.success).toBe(false)
  })
})

// ==============================
// ProjectCreateSchema
// ==============================

describe('ProjectCreateSchema', () => {
  it('应该验证合法的项目数据', () => {
    const result = ProjectCreateSchema.safeParse({
      name: '2025 春季广交会',
      type: 'exhibition',
      owner: '张三',
    })
    expect(result.success).toBe(true)
  })

  it('应该拒绝空名称', () => {
    const result = ProjectCreateSchema.safeParse({
      name: '',
      type: 'customer',
      owner: 'test',
    })
    expect(result.success).toBe(false)
  })

  it('应该拒绝无效的 type', () => {
    const result = ProjectCreateSchema.safeParse({
      name: 'test',
      type: 'invalid-type',
      owner: 'test',
    })
    expect(result.success).toBe(false)
  })
})

// ==============================
// MemoryCreateSchema
// ==============================

describe('MemoryCreateSchema', () => {
  it('应该验证合法的记忆数据', () => {
    const result = MemoryCreateSchema.safeParse({
      type: 'short',
      content: '客户偏好蓝色包装，不喜纸质缓冲材料',
    })
    expect(result.success).toBe(true)
  })

  it('应该拒绝 confidence 超出 [0, 1] 范围', () => {
    const result = MemoryCreateSchema.safeParse({
      content: 'test',
      confidence: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('应该拒绝空 content', () => {
    const result = MemoryCreateSchema.safeParse({
      content: '',
    })
    expect(result.success).toBe(false)
  })
})

// ==============================
// AgentLogCreateSchema
// ==============================

describe('AgentLogCreateSchema', () => {
  it('应该验证合法的日志数据', () => {
    const result = AgentLogCreateSchema.safeParse({
      taskName: '客户询盘分析',
      status: 'success',
      duration: '15s',
    })
    expect(result.success).toBe(true)
  })

  it('应该拒绝无效的 status', () => {
    const result = AgentLogCreateSchema.safeParse({
      taskName: 'test',
      status: 'pending',
      duration: '10s',
    })
    expect(result.success).toBe(false)
  })
})
