import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createSubworkflowHandler } from '../subworkflow-executor'
import type { WorkflowNode, WorkflowRunContext } from '../dag-types'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workflow: {
      findUnique: vi.fn(),
    },
  },
}))

describe('Subworkflow Executor 单元测试', () => {
  const mockRunWorkflow = vi.fn()
  const handler = createSubworkflowHandler(mockRunWorkflow)

  const createContext = (workspaceId = 'ws-1'): WorkflowRunContext => ({
    runId: 'parent-run-123',
    workflowId: 'parent-wf-123',
    trigger: 'manual',
    variables: { foo: 'bar' },
    nodeOutputs: {
      nodeA: { data: 'test' },
      __skipped__nodeB: true, // 应该被过滤掉的内部键
    },
    actor: 'admin',
    depth: 1,
    workspaceId,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('条件不足时：缺少 config.workflowId 应当直接返回失败', async () => {
    const node: WorkflowNode = {
      id: 'sub-node',
      kind: 'subworkflow',
      name: 'Subworkflow Node',
      config: {}, // 缺失 workflowId
    }
    const ctx = createContext()
    const result = await handler(node, ctx)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('缺少 config.workflowId')
  })

  it('正常流程：子流程租户匹配时，应正确过滤输入并成功执行', async () => {
    const node: WorkflowNode = {
      id: 'sub-node',
      kind: 'subworkflow',
      name: 'Subworkflow Node',
      config: { workflowId: 'child-wf-999' },
    }
    const ctx = createContext('ws-active')

    // Mock 数据库返回匹配的租户
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue({
      id: 'child-wf-999',
      workspaceId: 'ws-active',
    } as any)

    // Mock 子流程执行结果
    mockRunWorkflow.mockResolvedValue({
      runId: 'child-run-456',
      status: 'completed',
      output: { result: 'success-data' },
    })

    const result = await handler(node, ctx)

    expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
      where: { id: 'child-wf-999' },
      select: { workspaceId: true },
    })

    // 检查是否过滤了 __skipped__ 前缀的内部键并传递了 variables & nodeOutputs
    expect(mockRunWorkflow).toHaveBeenCalledWith('child-wf-999', {
      foo: 'bar', // variables 中的
      nodeA: { data: 'test' }, // nodeOutputs 中的正常输出
    }, {
      parentRunId: 'parent-run-123',
      depth: 2,
      trigger: 'subworkflow',
    })

    expect(result.status).toBe('completed')
    expect(result.output).toEqual({ result: 'success-data' })
  })

  it('安全防线：子工作流不属于当前 Workspace 时，必须安全拦截并阻断', async () => {
    const node: WorkflowNode = {
      id: 'sub-node',
      kind: 'subworkflow',
      name: 'Subworkflow Node',
      config: { workflowId: 'child-wf-hack' },
    }
    const ctx = createContext('ws-my-tenant')

    // Mock 数据库返回一个不同的租户
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue({
      id: 'child-wf-hack',
      workspaceId: 'ws-other-tenant', // 租户不匹配
    } as any)

    const result = await handler(node, ctx)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('安全阻断：子工作流')
    expect(result.riskLevel).toBe('high') // 升级高危标记
    expect(mockRunWorkflow).not.toHaveBeenCalled() // 绝对不可以被调用！
  })

  it('子工作流不存在时，应当优雅返回失败且不调用执行', async () => {
    const node: WorkflowNode = {
      id: 'sub-node',
      kind: 'subworkflow',
      name: 'Subworkflow Node',
      config: { workflowId: 'non-existent' },
    }
    const ctx = createContext('ws-1')

    // Mock 数据库返回 null
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue(null)

    const result = await handler(node, ctx)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('不存在')
    expect(mockRunWorkflow).not.toHaveBeenCalled()
  })
})
