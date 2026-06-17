import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/audit'
import {
  startWorkflowRun,
  executeWorkflowRun,
  executeStep,
  resumeWorkflowRun,
  cancelWorkflowRun,
  getWorkflowRunStatus,
  WorkflowRunNotFoundError,
  StepRunNotFoundError,
  WorkflowRunAlreadyCompletedError,
  WorkflowNodeNotSupportedError,
  ParallelLimitExceededError,
  RUNTIME_ENGINE_VERSION,
  MAX_PARALLEL_STEPS,
  MAX_STEP_RETRIES,
} from '../runtime-engine'

// ---- Mock prisma ----
vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    workflow: {
      findUnique: vi.fn(),
    },
    workflowRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    stepRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  }
  return { prisma: mockPrisma }
})

vi.mock('@/lib/server/audit', () => ({
  writeAuditLog: vi.fn(),
}))

// ---- 工具函数 ----
const makeWorkflow = (nodes: any[], edges: any[]) => ({
  id: 'wf-1',
  workspaceId: 'ws-1',
  nodes: JSON.stringify(nodes),
  edges: JSON.stringify(edges),
})

const makeWorkflowRun = (overrides: any = {}) => ({
  id: 'db-run-id',
  runId: 'run-abc',
  workflowId: 'wf-1',
  workspaceId: 'ws-1',
  status: 'running',
  mode: 'sequential',
  startedAt: new Date(),
  inputContext: {},
  steps: [],
  ...overrides,
})

const makeStep = (overrides: any = {}) => ({
  stepId: 'step-run-abc-node-A',
  runId: 'run-abc',
  workspaceId: 'ws-1',
  nodeId: 'node-A',
  nodeType: 'skill-call',
  status: 'pending',
  inputData: {},
  outputData: null,
  parentStepId: null,
  childStepIds: '[]',
  agentId: null,
  capabilityId: 'cap-1',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  errorCode: null,
  errorMessage: null,
  retryCount: 0,
  ...overrides,
})

// ---- 测试套件 ----
describe('Workflow Runtime Engine 单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ----------------------------------------------------------------
  // 1. 顶层常量校验
  // ----------------------------------------------------------------
  describe('顶层常量', () => {
    it('RUNTIME_ENGINE_VERSION 应为 "1.0"', () => {
      expect(RUNTIME_ENGINE_VERSION).toBe('1.0')
    })

    it('MAX_PARALLEL_STEPS 应为 10', () => {
      expect(MAX_PARALLEL_STEPS).toBe(10)
    })

    it('MAX_STEP_RETRIES 应为 3', () => {
      expect(MAX_STEP_RETRIES).toBe(3)
    })
  })

  // ----------------------------------------------------------------
  // 2. startWorkflowRun
  // ----------------------------------------------------------------
  describe('startWorkflowRun', () => {
    it('成功创建 WorkflowRun 并返回 running 状态', async () => {
      const nodes = [
        { id: 'A', kind: 'skill-call', config: { nodeType: 'skill-call', capabilityId: 'cap-1' } },
        { id: 'B', kind: 'skill-call', config: { nodeType: 'skill-call', capabilityId: 'cap-2' } },
      ]
      const edges = [{ from: 'A', to: 'B' }]

      vi.mocked(prisma.workflow.findUnique).mockResolvedValue(makeWorkflow(nodes, edges) as any)
      vi.mocked(prisma.workflowRun.create).mockResolvedValue(makeWorkflowRun({ status: 'pending', runId: 'run-abc' }) as any)
      vi.mocked(prisma.stepRun.create).mockResolvedValue(makeStep() as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'running' }) as any)

      const result = await startWorkflowRun({
        workflowId: 'wf-1',
        workspaceId: 'ws-1',
      }, { writeAuditLog: vi.fn() })

      expect(result.status).toBe('running')
      expect(prisma.workflowRun.create).toHaveBeenCalledTimes(1)
      expect(prisma.stepRun.create).toHaveBeenCalledTimes(nodes.length)
      expect(prisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'running' }) })
      )
    })

    it('Workflow 不存在时应抛出 Error', async () => {
      vi.mocked(prisma.workflow.findUnique).mockResolvedValue(null)
      await expect(
        startWorkflowRun({ workflowId: 'nonexistent', workspaceId: 'ws-1' }, { writeAuditLog: vi.fn() })
      ).rejects.toThrow('Workflow not found: nonexistent')
    })

    it('DAG 中含有循环时应抛出 "DAG contains cycles"', async () => {
      const nodes = [
        { id: 'A', kind: 'skill-call', config: { nodeType: 'skill-call' } },
        { id: 'B', kind: 'skill-call', config: { nodeType: 'skill-call' } },
      ]
      const edges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]

      vi.mocked(prisma.workflow.findUnique).mockResolvedValue(makeWorkflow(nodes, edges) as any)
      vi.mocked(prisma.workflowRun.create).mockResolvedValue(makeWorkflowRun() as any)

      await expect(
        startWorkflowRun({ workflowId: 'wf-1', workspaceId: 'ws-1' }, { writeAuditLog: vi.fn() })
      ).rejects.toThrow('DAG contains cycles')
    })

    it('不支持的 nodeType 应抛出 WorkflowNodeNotSupportedError', async () => {
      const nodes = [
        { id: 'A', kind: 'unknown-type', config: { nodeType: 'unknown-type' } },
      ]
      const edges: any[] = []

      vi.mocked(prisma.workflow.findUnique).mockResolvedValue(makeWorkflow(nodes, edges) as any)
      vi.mocked(prisma.workflowRun.create).mockResolvedValue(makeWorkflowRun() as any)

      await expect(
        startWorkflowRun({ workflowId: 'wf-1', workspaceId: 'ws-1' }, { writeAuditLog: vi.fn() })
      ).rejects.toThrow(WorkflowNodeNotSupportedError)
    })

    it('应写入 workflow.run.started AuditLog', async () => {
      const nodes = [{ id: 'A', kind: 'skill-call', config: { nodeType: 'skill-call' } }]
      const mockAudit = vi.fn()
      vi.mocked(prisma.workflow.findUnique).mockResolvedValue(makeWorkflow(nodes, []) as any)
      vi.mocked(prisma.workflowRun.create).mockResolvedValue(makeWorkflowRun() as any)
      vi.mocked(prisma.stepRun.create).mockResolvedValue(makeStep() as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'running' }) as any)

      await startWorkflowRun({ workflowId: 'wf-1', workspaceId: 'ws-1', triggeredBy: 'user-1' }, { writeAuditLog: mockAudit })

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'workflow.run.started', actor: 'user-1' })
      )
    })
  })

  // ----------------------------------------------------------------
  // 3. executeWorkflowRun
  // ----------------------------------------------------------------
  describe('executeWorkflowRun', () => {
    it('WorkflowRun 不存在时抛出 WorkflowRunNotFoundError', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null)
      await expect(
        executeWorkflowRun('no-run', 'ws-1', { writeAuditLog: vi.fn() })
      ).rejects.toThrow(WorkflowRunNotFoundError)
    })

    it('WorkflowRun 已 completed 时抛出 WorkflowRunAlreadyCompletedError', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(
        makeWorkflowRun({ status: 'completed', steps: [] }) as any
      )
      await expect(
        executeWorkflowRun('run-abc', 'ws-1', { writeAuditLog: vi.fn() })
      ).rejects.toThrow(WorkflowRunAlreadyCompletedError)
    })

    it('WorkflowRun 已 failed 时抛出 WorkflowRunAlreadyCompletedError', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(
        makeWorkflowRun({ status: 'failed', steps: [] }) as any
      )
      await expect(
        executeWorkflowRun('run-abc', 'ws-1', { writeAuditLog: vi.fn() })
      ).rejects.toThrow(WorkflowRunAlreadyCompletedError)
    })

    it('串行模式：所有步骤 completed 时更新 WorkflowRun 为 completed', async () => {
      const completedStep = makeStep({ status: 'completed', outputData: { result: 'ok' } })
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(
        makeWorkflowRun({ status: 'running', mode: 'sequential', steps: [completedStep] }) as any
      )
      vi.mocked(prisma.stepRun.findMany).mockResolvedValue([completedStep] as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'completed' }) as any)

      const result = await executeWorkflowRun('run-abc', 'ws-1', { writeAuditLog: vi.fn() })
      expect(result.status).toBe('completed')
      expect(prisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
      )
    })

    it('并行模式：超出 MAX_PARALLEL_STEPS 时抛出 ParallelLimitExceededError', async () => {
      const pendingSteps = Array.from({ length: MAX_PARALLEL_STEPS + 1 }, (_, i) =>
        makeStep({ stepId: `step-${i}`, nodeId: `node-${i}`, status: 'pending', parentStepId: null })
      )
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(
        makeWorkflowRun({ status: 'running', mode: 'parallel', steps: pendingSteps }) as any
      )
      vi.mocked(prisma.stepRun.findMany).mockResolvedValue(pendingSteps as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'failed' }) as any)

      await expect(
        executeWorkflowRun('run-abc', 'ws-1', { writeAuditLog: vi.fn() })
      ).rejects.toThrow(ParallelLimitExceededError)
    })

    it('有 waiting 步骤时 WorkflowRun 应被更新为 waiting 并暂停执行', async () => {
      const waitingStep = makeStep({ status: 'waiting' })
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(
        makeWorkflowRun({ status: 'running', mode: 'sequential', steps: [waitingStep] }) as any
      )
      vi.mocked(prisma.stepRun.findMany).mockResolvedValue([waitingStep] as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'waiting' }) as any)
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun({ status: 'waiting' }) as any)

      const result = await executeWorkflowRun('run-abc', 'ws-1', { writeAuditLog: vi.fn() })
      expect(prisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'waiting' }) })
      )
    })
  })

  // ----------------------------------------------------------------
  // 4. executeStep
  // ----------------------------------------------------------------
  describe('executeStep', () => {
    it('StepRun 不存在时抛出 StepRunNotFoundError', async () => {
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(null)
      await expect(
        executeStep('no-step', {}, { writeAuditLog: vi.fn() })
      ).rejects.toThrow(StepRunNotFoundError)
    })

    it('skill-call：正常调用 callCapability 并更新 StepRun 为 completed', async () => {
      const step = makeStep({ nodeType: 'skill-call', capabilityId: 'cap-1' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const mockCallCapability = vi.fn().mockResolvedValue({ value: 42 })
      const result = await executeStep('step-run-abc-node-A', { key: 'val' }, {
        writeAuditLog: vi.fn(),
        callCapability: mockCallCapability,
      })

      expect(mockCallCapability).toHaveBeenCalledWith('cap-1', expect.objectContaining({ key: 'val' }), expect.any(Object))
      expect(result).toEqual({ value: 42 })
      expect(prisma.stepRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
      )
    })

    it('connector-call：调用 callCapability，cap 不存在时抛出错误', async () => {
      vi.useFakeTimers()
      const step = makeStep({ nodeType: 'connector-call', capabilityId: 'conn-1' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'failed' } as any)

      let error: any
      const p = executeStep('step-run-abc-node-A', {}, { writeAuditLog: vi.fn() }).catch(e => error = e)
      // 推进 MAX_STEP_RETRIES 次重试延时（3 次 * 3000ms = 9000ms）
      for (let i = 0; i <= 3; i++) {
        await vi.advanceTimersByTimeAsync(3100)
      }
      await p
      expect(error).toBeDefined()
      expect(error.message).toMatch('callCapability not configured')
      vi.useRealTimers()
    })

    it('agent-call：调用 callAgent 并返回输出', async () => {
      const step = makeStep({ nodeType: 'agent-call', agentId: 'agent-1' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const mockCallAgent = vi.fn().mockResolvedValue({ answer: 'yes' })
      const result = await executeStep('step-run-abc-node-A', {}, {
        writeAuditLog: vi.fn(),
        callAgent: mockCallAgent,
      })

      expect(mockCallAgent).toHaveBeenCalledWith('agent-1', expect.any(Object), expect.any(Object))
      expect(result).toEqual({ answer: 'yes' })
    })

    it('condition 节点（内置）：变量匹配时 output.result = true', async () => {
      const step = makeStep({ nodeType: 'condition' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.findMany).mockResolvedValue([step] as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const result = await executeStep('step-run-abc-node-A', {
        conditionConfig: { variable: 'score', expected: '100' },
        score: 100,
      }, { writeAuditLog: vi.fn() })

      expect(result.result).toBe(true)
    })

    it('condition 节点（内置）：变量不匹配时 output.result = false', async () => {
      const step = makeStep({ nodeType: 'condition' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.findMany).mockResolvedValue([step] as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const result = await executeStep('step-run-abc-node-A', {
        conditionConfig: { variable: 'score', expected: '100' },
        score: 50,
      }, { writeAuditLog: vi.fn() })

      expect(result.result).toBe(false)
    })

    it('human-approval 节点：未配置 requestHumanApproval 时应暂停并更新为 waiting', async () => {
      const step = makeStep({ nodeType: 'human-approval' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'waiting' } as any)

      await expect(
        executeStep('step-run-abc-node-A', {}, { writeAuditLog: vi.fn() })
      ).rejects.toThrow('Approval pending')

      expect(prisma.stepRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'waiting' }) })
      )
    })

    it('human-approval 节点：approved=true 时继续执行', async () => {
      const step = makeStep({ nodeType: 'human-approval' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const mockRequestHumanApproval = vi.fn().mockResolvedValue(true)
      const result = await executeStep('step-run-abc-node-A', {}, {
        writeAuditLog: vi.fn(),
        requestHumanApproval: mockRequestHumanApproval,
      })

      expect(result.approved).toBe(true)
    })

    it('human-approval 节点：approved=false 时抛出错误', async () => {
      vi.useFakeTimers()
      const step = makeStep({ nodeType: 'human-approval' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'failed' } as any)

      const mockRequestHumanApproval = vi.fn().mockResolvedValue(false)
      let error: any
      const p = executeStep('step-run-abc-node-A', {}, {
        writeAuditLog: vi.fn(),
        requestHumanApproval: mockRequestHumanApproval,
      }).catch(e => error = e)
      for (let i = 0; i <= 3; i++) {
        await vi.advanceTimersByTimeAsync(3100)
      }
      await p
      expect(error).toBeDefined()
      expect(error.message).toMatch('Human approval rejected')
      vi.useRealTimers()
    })

    it('delay 节点：delayMs 超过 30000 时被截断到 30s 并写 warning 审计', async () => {
      const step = makeStep({ nodeType: 'delay' })
      const mockAudit = vi.fn()
      vi.useFakeTimers()
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const p = executeStep('step-run-abc-node-A', { delayMs: 99999 }, { writeAuditLog: mockAudit })
      await vi.advanceTimersByTimeAsync(31000)
      const result = await p

      expect(result.delayedMs).toBe(30000)
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'workflow.step.warning' })
      )
      vi.useRealTimers()
    })

    it('merge 节点：合并多个结果对象', async () => {
      const step = makeStep({ nodeType: 'merge' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...step, status: 'completed' } as any)

      const result = await executeStep('step-run-abc-node-A', {
        results: [{ a: 1 }, { b: 2 }]
      }, { writeAuditLog: vi.fn() })

      expect(result).toEqual(expect.objectContaining({ a: 1, b: 2 }))
    })

    it('执行失败时应触发重试逻辑，达到最大重试次数后标记为 failed', async () => {
      vi.useFakeTimers()
      const step = makeStep({ nodeType: 'skill-call', capabilityId: 'cap-1' })
      vi.mocked(prisma.stepRun.findUnique).mockResolvedValue(step as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue(step as any)

      const mockCallCapability = vi.fn().mockRejectedValue(new Error('persistent error'))

      let error: any
      const p = executeStep('step-run-abc-node-A', {}, {
        writeAuditLog: vi.fn(),
        callCapability: mockCallCapability,
      }).catch(e => error = e)

      // 推进所有重试延时（MAX_STEP_RETRIES=3 次，每次 3100ms）
      for (let i = 0; i <= MAX_STEP_RETRIES; i++) {
        await vi.advanceTimersByTimeAsync(3100)
      }

      await p
      expect(error).toBeDefined()
      expect(error.message).toMatch('persistent error')

      // 至少调用 MAX_STEP_RETRIES + 1 次
      expect(mockCallCapability.mock.calls.length).toBeGreaterThan(MAX_STEP_RETRIES)

      // 最终应标记为 failed
      const updateCalls = vi.mocked(prisma.stepRun.update).mock.calls
      const failedCall = updateCalls.find((c: any) => c[0]?.data?.status === 'failed')
      expect(failedCall).toBeDefined()
      vi.useRealTimers()
    })
  })

  // ----------------------------------------------------------------
  // 5. resumeWorkflowRun
  // ----------------------------------------------------------------
  describe('resumeWorkflowRun', () => {
    it('WorkflowRun 不存在时抛出 WorkflowRunNotFoundError', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null)
      await expect(
        resumeWorkflowRun('no-run', 'ws-1', true, 'admin', { writeAuditLog: vi.fn() })
      ).rejects.toThrow(WorkflowRunNotFoundError)
    })

    it('没有 waiting step 时抛出 Error', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun() as any)
      vi.mocked(prisma.stepRun.findFirst).mockResolvedValue(null)
      await expect(
        resumeWorkflowRun('run-abc', 'ws-1', true, 'admin', { writeAuditLog: vi.fn() })
      ).rejects.toThrow('No waiting step found')
    })

    it('approved=true：waiting step 标记为 completed，WorkflowRun 恢复 running', async () => {
      const waitingStep = makeStep({ status: 'waiting' })
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun({ status: 'waiting' }) as any)
      vi.mocked(prisma.stepRun.findFirst).mockResolvedValue(waitingStep as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...waitingStep, status: 'completed' } as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'running' }) as any)

      await resumeWorkflowRun('run-abc', 'ws-1', true, 'admin', { writeAuditLog: vi.fn() })

      expect(prisma.stepRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed', outputData: { approved: true } }) })
      )
      expect(prisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'running' }) })
      )
    })

    it('approved=false：写入 APPROVAL_REJECTED 并取消工作流', async () => {
      const waitingStep = makeStep({ status: 'waiting' })
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun({ status: 'waiting' }) as any)
      vi.mocked(prisma.stepRun.findFirst).mockResolvedValue(waitingStep as any)
      vi.mocked(prisma.stepRun.update).mockResolvedValue({ ...waitingStep, status: 'failed' } as any)
      vi.mocked(prisma.stepRun.updateMany).mockResolvedValue({ count: 1 } as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'cancelled' }) as any)

      await resumeWorkflowRun('run-abc', 'ws-1', false, 'admin', { writeAuditLog: vi.fn() })

      const updateCalls = vi.mocked(prisma.stepRun.update).mock.calls
      const rejectedCall = updateCalls.find((c: any) => c[0]?.data?.errorCode === 'APPROVAL_REJECTED')
      expect(rejectedCall).toBeDefined()
    })
  })

  // ----------------------------------------------------------------
  // 6. cancelWorkflowRun
  // ----------------------------------------------------------------
  describe('cancelWorkflowRun', () => {
    it('WorkflowRun 不存在时抛出 WorkflowRunNotFoundError', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null)
      await expect(
        cancelWorkflowRun('no-run', 'ws-1', 'admin', { writeAuditLog: vi.fn() })
      ).rejects.toThrow(WorkflowRunNotFoundError)
    })

    it('取消成功：所有 pending/running/waiting 步骤变 skipped，Run 变 cancelled', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun() as any)
      vi.mocked(prisma.stepRun.updateMany).mockResolvedValue({ count: 2 } as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'cancelled' }) as any)

      const result = await cancelWorkflowRun('run-abc', 'ws-1', 'admin', { writeAuditLog: vi.fn() })

      expect(prisma.stepRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'skipped' }) })
      )
      expect(result.status).toBe('cancelled')
    })

    it('取消时应写入 workflow.run.cancelled AuditLog', async () => {
      const mockAudit = vi.fn()
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun() as any)
      vi.mocked(prisma.stepRun.updateMany).mockResolvedValue({ count: 0 } as any)
      vi.mocked(prisma.workflowRun.update).mockResolvedValue(makeWorkflowRun({ status: 'cancelled' }) as any)

      await cancelWorkflowRun('run-abc', 'ws-1', 'user-x', { writeAuditLog: mockAudit })
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'workflow.run.cancelled', actor: 'user-x' })
      )
    })
  })

  // ----------------------------------------------------------------
  // 7. getWorkflowRunStatus
  // ----------------------------------------------------------------
  describe('getWorkflowRunStatus', () => {
    it('WorkflowRun 不存在时抛出 WorkflowRunNotFoundError', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null)
      await expect(
        getWorkflowRunStatus('no-run', 'ws-1')
      ).rejects.toThrow(WorkflowRunNotFoundError)
    })

    it('返回正确的 summary 统计（completed/failed/skipped）', async () => {
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(makeWorkflowRun() as any)
      vi.mocked(prisma.stepRun.findMany).mockResolvedValue([
        makeStep({ status: 'completed' }),
        makeStep({ stepId: 'step-2', nodeId: 'node-B', status: 'failed' }),
        makeStep({ stepId: 'step-3', nodeId: 'node-C', status: 'skipped' }),
        makeStep({ stepId: 'step-4', nodeId: 'node-D', status: 'pending' }),
      ] as any)

      const result = await getWorkflowRunStatus('run-abc', 'ws-1')
      expect(result.summary).toEqual({
        total: 4,
        pending: 1,
        running: 0,
        completed: 1,
        failed: 1,
        skipped: 1,
      })
    })
  })
})
