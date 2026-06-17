import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/audit'
import * as runtimeEngine from '../workflow/runtime-engine'
import {
  startWorkflowRun,
  executeWorkflowRun,
  executeStep,
  resumeWorkflowRun,
  cancelWorkflowRun,
  getWorkflowRunStatus,
  WorkflowNodeNotSupportedError,
  WorkflowRunTimeoutError,
  WorkflowRunAlreadyCompletedError
} from '../workflow/runtime-engine'

// Mock prisma and audit
vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    workflow: {
      findUnique: vi.fn(),
    },
    workflowRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    stepRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    agent: {
      findUnique: vi.fn(),
    },
    orchestrationSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subAgentTask: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    agentMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
  }
  return { prisma: mockPrisma }
})

vi.mock('@/lib/server/audit', () => ({
  writeAuditLog: vi.fn(),
}))

describe('Workflow Runtime Engine 单元测试', () => {
  const workspaceId = 'ws-test'
  const workflowId = 'wf-test'

  const mockNodes = [
    { id: 'nodeA', kind: 'agent-call', config: { agentId: 'agent-1' } },
    { id: 'nodeB', kind: 'delay', config: { delayMs: 10 } },
  ]
  const mockEdges = [{ from: 'nodeA', to: 'nodeB' }]

  const mockWorkflow = {
    id: workflowId,
    workspaceId,
    nodes: JSON.stringify(mockNodes),
    edges: JSON.stringify(mockEdges)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock behavior
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue(mockWorkflow as any)
    vi.mocked(prisma.workflowRun.create).mockResolvedValue({ runId: 'run-123', status: 'pending' } as any)
    vi.mocked(prisma.stepRun.create).mockResolvedValue({} as any)
    vi.mocked(prisma.workflowRun.update).mockResolvedValue({ runId: 'run-123', status: 'running' } as any)
  })

  // 1. startWorkflowRun 成功
  it('startWorkflowRun 成功：创建 WorkflowRun + StepRun，写入 AuditLog', async () => {
    const run = await startWorkflowRun({ workflowId, workspaceId })
    expect(prisma.workflowRun.create).toHaveBeenCalled()
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: expect.stringMatching(/^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        })
      })
    )
    expect(prisma.stepRun.create).toHaveBeenCalledTimes(2)
    expect(prisma.workflowRun.update).toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalled()
  })

  // 2. startWorkflowRun 不支持 nodeType 报错
  it('startWorkflowRun 含不支持 nodeType：抛出 WorkflowNodeNotSupportedError', async () => {
    const badWorkflow = {
      ...mockWorkflow,
      nodes: JSON.stringify([{ id: 'badNode', kind: 'unsupported-type' }])
    }
    vi.mocked(prisma.workflow.findUnique).mockResolvedValue(badWorkflow as any)

    await expect(startWorkflowRun({ workflowId, workspaceId })).rejects.toThrow(
      WorkflowNodeNotSupportedError
    )
  })

  // 3. executeWorkflowRun 串行模式
  it('executeWorkflowRun 串行模式：步骤顺序执行，output 管道传递', async () => {
    const runId = 'run-123'
    const mockRun = {
      runId,
      status: 'running',
      mode: 'sequential',
      workflowId,
      workspaceId,
      inputContext: { init: 'hello' }
    }
    const mockSteps = [
      { stepId: 'stepA', nodeId: 'nodeA', nodeType: 'agent-call', status: 'pending', agentId: 'agent-1', parentStepId: null },
      { stepId: 'stepB', nodeId: 'nodeB', nodeType: 'delay', status: 'pending', parentStepId: 'stepA', childStepIds: '[]' }
    ]

    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(mockRun as any)
    vi.mocked(prisma.stepRun.findMany)
      .mockResolvedValueOnce(mockSteps as any) // first check
      .mockResolvedValueOnce([
        { ...mockSteps[0], status: 'completed', outputData: { resA: 'valA' } },
        mockSteps[1]
      ] as any) // second check
      .mockResolvedValue([
        { ...mockSteps[0], status: 'completed', outputData: { resA: 'valA' } },
        { ...mockSteps[1], status: 'completed', outputData: { resB: 'valB' } }
      ] as any) // final checks

    vi.mocked(prisma.stepRun.findUnique)
      .mockResolvedValueOnce(mockSteps[0] as any) // executeStep stepA lookup
      .mockResolvedValueOnce(mockSteps[1] as any) // executeStep stepB lookup

    const mockCallAgent = vi.fn().mockResolvedValue({ resA: 'valA' })

    const finalRun = await executeWorkflowRun(runId, workspaceId, {
      writeAuditLog: vi.fn(),
      callAgent: mockCallAgent
    })

    expect(mockCallAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({ init: 'hello' }), expect.any(Object))
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId },
        data: expect.objectContaining({ status: 'completed' })
      })
    )
  })

  // 4. executeWorkflowRun 并行模式
  it('executeWorkflowRun 并行模式：步骤并发执行，限制 <= MAX_PARALLEL_STEPS', async () => {
    const runId = 'run-parallel'
    const mockRun = {
      runId,
      status: 'running',
      mode: 'parallel',
      workflowId,
      workspaceId,
      inputContext: {}
    }
    // 两个同层的并行节点
    const mockSteps = [
      { stepId: 'step1', nodeId: 'node1', nodeType: 'branch', status: 'pending', parentStepId: null, childStepIds: '[]' },
      { stepId: 'step2', nodeId: 'node2', nodeType: 'branch', status: 'pending', parentStepId: null, childStepIds: '[]' }
    ]

    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(mockRun as any)
    vi.mocked(prisma.stepRun.findMany)
      .mockResolvedValueOnce(mockSteps as any)
      .mockResolvedValueOnce([
        { ...mockSteps[0], status: 'completed', outputData: { out1: 1 } },
        { ...mockSteps[1], status: 'completed', outputData: { out2: 2 } }
      ] as any)

    vi.mocked(prisma.stepRun.findUnique)
      .mockResolvedValueOnce(mockSteps[0] as any)
      .mockResolvedValueOnce(mockSteps[1] as any)

    const finalRun = await executeWorkflowRun(runId, workspaceId, {
      writeAuditLog: vi.fn()
    })

    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId },
        data: expect.objectContaining({ status: 'completed' })
      })
    )
  })

  // 5. 条件模式
  it('executeWorkflowRun 条件模式：condition=true 走向 true-branch，false-branch 被 skipped', async () => {
    const runId = 'run-cond'
    const mockRun = {
      runId,
      status: 'running',
      mode: 'sequential',
      workflowId,
      workspaceId,
      inputContext: { conditionConfig: { variable: 'val', expected: '10' }, val: '10' }
    }
    const mockSteps = [
      { stepId: 'stepCond', nodeId: 'cond', nodeType: 'condition', status: 'pending', parentStepId: null, childStepIds: '["stepTrue", "stepFalse"]' },
      { stepId: 'stepTrue', nodeId: 'nodeTrue', nodeType: 'branch', status: 'pending', parentStepId: 'stepCond', childStepIds: '[]' },
      { stepId: 'stepFalse', nodeId: 'nodeFalse', nodeType: 'branch', status: 'pending', parentStepId: 'stepCond', childStepIds: '[]' }
    ]

    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(mockRun as any)
    vi.mocked(prisma.stepRun.findMany)
      .mockResolvedValueOnce(mockSteps as any)
      .mockResolvedValueOnce([
        { ...mockSteps[0], status: 'completed', outputData: { result: true } },
        mockSteps[1],
        { ...mockSteps[2], status: 'skipped' } // stepFalse is skipped
      ] as any)
      .mockResolvedValueOnce([
        { ...mockSteps[0], status: 'completed', outputData: { result: true } },
        { ...mockSteps[1], status: 'completed' },
        { ...mockSteps[2], status: 'skipped' }
      ] as any)

    vi.mocked(prisma.stepRun.findUnique)
      .mockResolvedValueOnce(mockSteps[0] as any)
      .mockResolvedValueOnce(mockSteps[1] as any)

    await executeWorkflowRun(runId, workspaceId, {
      writeAuditLog: vi.fn()
    })

    expect(prisma.stepRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId, status: { in: ['pending', 'running', 'waiting'] } }
      })
    )
  })

  // 6. human-in-loop
  it('executeWorkflowRun human-in-loop：步骤到达 human-approval 时 status="waiting-human"', async () => {
    const runId = 'run-hil'
    const mockRun = {
      runId,
      status: 'running',
      mode: 'sequential',
      workflowId,
      workspaceId,
      inputContext: {}
    }
    const mockSteps = [
      { stepId: 'stepApprove', nodeId: 'approve', nodeType: 'human-approval', status: 'pending', parentStepId: null, childStepIds: '[]' }
    ]

    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(mockRun as any)
    vi.mocked(prisma.stepRun.findMany).mockResolvedValue(mockSteps as any)
    vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(mockSteps[0] as any)

    const finalRun = await executeWorkflowRun(runId, workspaceId, {
      writeAuditLog: vi.fn()
    })

    // 应该暂停在 waiting 状态
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId },
        data: { status: 'waiting' }
      })
    )
  })

  // 7. resumeWorkflowRun approved=true
  it('resumeWorkflowRun approved=true：继续执行剩余步骤', async () => {
    const runId = 'run-hil'
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({ runId, status: 'waiting', workflowId } as any)
    vi.mocked(prisma.stepRun.findFirst).mockResolvedValue({ stepId: 'stepApprove', status: 'waiting' } as any)

    await resumeWorkflowRun(runId, workspaceId, true, 'admin', {
      writeAuditLog: vi.fn()
    })

    expect(prisma.stepRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stepId: 'stepApprove' },
        data: expect.objectContaining({ status: 'completed' })
      })
    )
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId },
        data: { status: 'running' }
      })
    )
  })

  // 8. resumeWorkflowRun approved=false
  it('resumeWorkflowRun approved=false：WorkflowRun.status="cancelled"', async () => {
    const runId = 'run-hil'
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({ runId, status: 'waiting', workflowId } as any)
    vi.mocked(prisma.stepRun.findFirst).mockResolvedValue({ stepId: 'stepApprove', status: 'waiting' } as any)

    await resumeWorkflowRun(runId, workspaceId, false, 'admin', {
      writeAuditLog: vi.fn()
    })

    expect(prisma.stepRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stepId: 'stepApprove' },
        data: expect.objectContaining({ status: 'failed' })
      })
    )
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId },
        data: expect.objectContaining({ status: 'cancelled' })
      })
    )
  })

  // 9. executeWorkflowRun 步骤失败后重试
  it('executeWorkflowRun 步骤失败后重试：前两次失败第三次成功', async () => {
    const stepId = 'step-retry'
    const mockStep = {
      stepId,
      nodeType: 'agent-call',
      agentId: 'agent-1',
      status: 'pending',
      retryCount: 0,
      workspaceId
    }

    vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(mockStep as any)

    const mockCallAgent = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce({ success: true })

    const output = await executeStep(stepId, {}, {
      writeAuditLog: vi.fn(),
      callAgent: mockCallAgent
    })

    expect(output).toEqual({ success: true })
    expect(prisma.stepRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stepId },
        data: expect.objectContaining({ status: 'completed' })
      })
    )
  })

  // 10. executeWorkflowRun 步骤重试耗尽
  it('executeWorkflowRun 步骤重试耗尽：status="failed"', async () => {
    const stepId = 'step-retry-exhausted'
    const mockStep = {
      stepId,
      nodeType: 'agent-call',
      agentId: 'agent-1',
      status: 'pending',
      retryCount: 3, // 达到最大重试上限
      workspaceId
    }

    vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(mockStep as any)

    const mockCallAgent = vi.fn().mockRejectedValue(new Error('permanent error'))

    await expect(
      executeStep(stepId, {}, {
        writeAuditLog: vi.fn(),
        callAgent: mockCallAgent
      })
    ).rejects.toThrow('permanent error')

    expect(prisma.stepRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stepId },
        data: expect.objectContaining({ status: 'failed' })
      })
    )
  })


  // 12. cancelWorkflowRun
  it('cancelWorkflowRun：pending/running 步骤全部 skipped，Run.status="cancelled"', async () => {
    const runId = 'run-cancel'
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({ runId, workflowId } as any)

    await cancelWorkflowRun(runId, workspaceId, 'admin', {
      writeAuditLog: vi.fn()
    })

    expect(prisma.stepRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId, status: { in: ['pending', 'running', 'waiting'] } },
        data: { status: 'skipped' }
      })
    )
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId },
        data: expect.objectContaining({ status: 'cancelled' })
      })
    )
  })
})
