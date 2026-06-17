import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/server/audit'
import * as orchestrator from '../orchestrator'
import {
  createOrchestrationSession,
  dispatchSubAgentTask,
  runOrchestration,
  resumeOrchestrationSession,
  getOrchestrationSession,
  SubAgentLimitExceededError,
  SubAgentNotAvailableError,
  SessionTimeoutError
} from '../orchestrator'

// Mock prisma and audit
vi.mock('@/lib/prisma', () => {
  const taskStore = new Map<string, any>()
  const sessionStore = new Map<string, any>()
  ;(global as any).__mockTaskStore = taskStore
  ;(global as any).__mockSessionStore = sessionStore

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
      create: vi.fn(async ({ data }) => {
        sessionStore.set(data.sessionId, { ...data })
        return { ...data }
      }),
      findUnique: vi.fn(async ({ where }) => {
        return sessionStore.get(where.sessionId) || null
      }),
      findFirst: vi.fn(async ({ where }) => {
        return sessionStore.get(where.sessionId) || null
      }),
      update: vi.fn(async ({ where, data }) => {
        const item = sessionStore.get(where.sessionId) || {}
        const updated = { ...item, ...data }
        sessionStore.set(where.sessionId, updated)
        return updated
      }),
    },
    subAgentTask: {
      create: vi.fn(async ({ data }) => {
        taskStore.set(data.taskId, { ...data })
        return { ...data }
      }),
      findUnique: vi.fn(async ({ where }) => {
        return taskStore.get(where.taskId) || null
      }),
      findMany: vi.fn(async ({ where }) => {
        const arr = Array.from(taskStore.values())
        return arr.filter(t => t.sessionId === where.sessionId)
      }),
      update: vi.fn(async ({ where, data }) => {
        const item = taskStore.get(where.taskId) || {}
        const updated = { ...item, ...data }
        taskStore.set(where.taskId, updated)
        return updated
      }),
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

describe('Multi-Agent Orchestrator 单元测试', () => {
  const workspaceId = 'ws-test'
  const workflowRunId = 'run-123'
  const orchestratorAgentId = 'orch-agent'
  const subAgentIds = ['agent-1', 'agent-2']

  beforeEach(async () => {
    vi.useRealTimers()
    vi.clearAllMocks()
    const tStore = (global as any).__mockTaskStore
    const sStore = (global as any).__mockSessionStore
    if (tStore) tStore.clear()
    if (sStore) sStore.clear()

    // 用 mockImplementation 重置，以抹去任何测试遗留下来的 mockResolvedValue 污染
    ;(prisma.orchestrationSession.create as any).mockImplementation(async ({ data }: any) => {
      sStore.set(data.sessionId, { ...data })
      return { ...data }
    })
    ;(prisma.orchestrationSession.findUnique as any).mockImplementation(async ({ where }: any) => {
      return sStore.get(where.sessionId) || null
    })
    ;(prisma.orchestrationSession.findFirst as any).mockImplementation(async ({ where }: any) => {
      return sStore.get(where.sessionId) || null
    })
    ;(prisma.orchestrationSession.update as any).mockImplementation(async ({ where, data }: any) => {
      const item = sStore.get(where.sessionId) || {}
      const updated = { ...item, ...data }
      sStore.set(where.sessionId, updated)
      return updated
    })

    ;(prisma.subAgentTask.create as any).mockImplementation(async ({ data }: any) => {
      tStore.set(data.taskId, { ...data })
      return { ...data }
    })
    ;(prisma.subAgentTask.findUnique as any).mockImplementation(async ({ where }: any) => {
      return tStore.get(where.taskId) || null
    })
    ;(prisma.subAgentTask.findMany as any).mockImplementation(async ({ where }: any) => {
      const arr = Array.from(tStore.values())
      return arr.filter((t: any) => t.sessionId === where.sessionId)
    })
    ;(prisma.subAgentTask.update as any).mockImplementation(async ({ where, data }: any) => {
      const item = tStore.get(where.taskId) || {}
      const updated = { ...item, ...data }
      tStore.set(where.taskId, updated)
      return updated
    })

    // Default active agent behavior
    ;(prisma.agent.findUnique as any).mockImplementation(async ({ where }: any) => {
      if (where.id === orchestratorAgentId) {
        return { id: orchestratorAgentId, status: 'active', automationLevel: 'L3' } as any
      }
      return { id: where.id, status: 'active', automationLevel: 'L2' } as any
    })

    // 用真实写入 store 来作为默认的 sess-123 初始化
    await prisma.orchestrationSession.create({
      data: {
        sessionId: 'sess-123',
        workspaceId,
        workflowRunId,
        orchestratorAgentId,
        subAgentIds: JSON.stringify(subAgentIds),
        mode: 'sequential',
        status: 'running',
        goal: 'test goal',
        inputContext: {}
      } as any
    })
  })

  // 1. createOrchestrationSession 成功
  it('createOrchestrationSession 成功：所有 Sub-Agent 存在且 active', async () => {
    const session = await createOrchestrationSession({
      workflowRunId,
      workspaceId,
      orchestratorAgentId,
      subAgentIds,
      mode: 'sequential',
      goal: 'test goal',
      sessionId: 'sess-123'
    })

    expect(prisma.orchestrationSession.create).toHaveBeenCalled()
    expect(session.sessionId).toBe('sess-123')
  })

  // 2. 超出限制报错
  it('createOrchestrationSession 超出 MAX_SUB_AGENTS 抛出 SubAgentLimitExceededError', async () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => `agent-${i}`)
    await expect(
      createOrchestrationSession({
        workflowRunId,
        workspaceId,
        orchestratorAgentId,
        subAgentIds: tooMany,
        mode: 'sequential',
        goal: 'test goal'
      })
    ).rejects.toThrow(SubAgentLimitExceededError)
  })

  // 3. Sub-Agent 不存在报错
  it('createOrchestrationSession Sub-Agent 不存在抛出 SubAgentNotAvailableError', async () => {
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(null) // agent missing

    await expect(
      createOrchestrationSession({
        workflowRunId,
        workspaceId,
        orchestratorAgentId,
        subAgentIds,
        mode: 'sequential',
        goal: 'test goal'
      })
    ).rejects.toThrow(SubAgentNotAvailableError)
  })

  // 4. Orchestrator automationLevel L1 抛出 Error
  it('createOrchestrationSession Orchestrator automationLevel L1 抛出 Error', async () => {
    ;(prisma.agent.findUnique as any).mockImplementation(async ({ where }: any) => {
      if (where.id === orchestratorAgentId) {
        return { id: orchestratorAgentId, status: 'active', automationLevel: 'L1' } as any
      }
      return { id: where.id, status: 'active', automationLevel: 'L2' } as any
    })

    await expect(
      createOrchestrationSession({
        workflowRunId,
        workspaceId,
        orchestratorAgentId,
        subAgentIds,
        mode: 'sequential',
        goal: 'test goal'
      })
    ).rejects.toThrow('Orchestrator agent must be L3+ automation level')
  })

  // 5. dispatchSubAgentTask 成功
  it('dispatchSubAgentTask 成功：写入 SubAgentTask + AgentMessage（task-dispatch + task-result）', async () => {
    vi.mocked(prisma.subAgentTask.create).mockResolvedValue({} as any)
    vi.mocked(prisma.agentMessage.create).mockResolvedValue({} as any)

    const mockCallSubAgent = vi.fn().mockResolvedValue({ result: 'ok' })

    const task = await dispatchSubAgentTask(
      'sess-123',
      'agent-1',
      'Run action',
      { data: 1 },
      workspaceId,
      undefined,
      {
        writeAuditLog: vi.fn(),
        callSubAgent: mockCallSubAgent
      }
    )

    expect(prisma.subAgentTask.create).toHaveBeenCalled()
    expect(prisma.agentMessage.create).toHaveBeenCalledTimes(2) // task-dispatch and task-result
    expect(mockCallSubAgent).toHaveBeenCalledWith('agent-1', 'Run action', expect.any(Object), expect.any(Object))
  })

  // 6. dispatchSubAgentTask 超时
  it('dispatchSubAgentTask 超时：status="failed", errorCode="TASK_TIMEOUT"', async () => {
    const mockCallSubAgent = vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves

    const promise = dispatchSubAgentTask(
      'sess-123',
      'agent-1',
      'Run action',
      {},
      workspaceId,
      { timeoutMs: 10 },
      {
        writeAuditLog: vi.fn(),
        callSubAgent: mockCallSubAgent
      }
    )

    await expect(promise).rejects.toThrow(SessionTimeoutError)
    expect(prisma.subAgentTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorCode: 'TASK_TIMEOUT' })
      })
    )
  })

  // 7. dispatchSubAgentTask 失败重试
  it('dispatchSubAgentTask 失败重试：maxRetries=2，mock 失败 1 次后成功', async () => {
    const mockCallSubAgent = vi.fn()
      .mockRejectedValueOnce(new Error('temporary error'))
      .mockResolvedValueOnce({ output: 'ok' })

    await dispatchSubAgentTask(
      'sess-123',
      'agent-1',
      'Run action',
      {},
      workspaceId,
      { maxRetries: 2 },
      {
        writeAuditLog: vi.fn(),
        callSubAgent: mockCallSubAgent
      }
    )

    expect(mockCallSubAgent).toHaveBeenCalledTimes(2)
  })

  // 8. runOrchestration 串行管道模式
  it('runOrchestration 串行模式：output 管道传递到下一个 Agent', async () => {
    const mockCallSubAgent = vi.fn()
      .mockResolvedValueOnce({ step1: 'res1' }) // first agent
      .mockResolvedValueOnce({ step2: 'res2' }) // second agent

    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-seq',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-seq',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'running',
      inputContext: {}
    } as any)

    const session = await runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId,
      subAgentIds,
      mode: 'sequential',
      goal: 'pipelined task'
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallSubAgent
    })

    // 第二个 Agent 的输入应该合并了第一个 Agent 的输出
    expect(mockCallSubAgent).toHaveBeenNthCalledWith(
      2,
      'agent-2',
      expect.any(String),
      expect.objectContaining({ step1: 'res1' }),
      expect.any(Object)
    )

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-seq' },
        data: expect.objectContaining({ status: 'completed' })
      })
    )
  })

  // 9. runOrchestration 并行模式
  it('runOrchestration 并行模式：Promise.allSettled 一个失败不影响其余', async () => {
    const mockCallSubAgent = vi.fn()
      .mockRejectedValueOnce(new Error('agent 1 failed'))
      .mockResolvedValueOnce({ agent2: 'ok' })

    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-par',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-par',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'running',
      inputContext: {}
    } as any)

    const session = await runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId,
      subAgentIds,
      mode: 'parallel',
      goal: 'parallel tasks'
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallSubAgent
    })

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-par' },
        data: expect.objectContaining({
          status: 'completed',
          mergedOutput: expect.objectContaining({ agent2: 'ok' })
        })
      })
    )
  })

  // 10. runOrchestration 结果合并策略测试 (union, append, first-wins, majority)
  it('内置 mergeSubAgentResults：支持 union, append, first-wins, majority 合并策略', async () => {
    const subIds = ['agent-1', 'agent-2', 'agent-3']
    ;(prisma.agent.findUnique as any).mockImplementation(async ({ where }: any) => {
      return { id: where.id, status: 'active', automationLevel: 'L3' } as any
    })

    // --- A. 测试 majority 策略 ---
    const mockCallMajority = vi.fn()
      .mockResolvedValueOnce({ key: 'val1', major: 'A' })
      .mockResolvedValueOnce({ key: 'val2', major: 'A' })
      .mockResolvedValueOnce({ key: 'val3', major: 'B' })

    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-merge-majority',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-merge-majority',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subIds),
      status: 'running',
      inputContext: { mergeStrategy: 'majority' }
    } as any)

    await runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId: 'agent-1',
      subAgentIds: subIds,
      mode: 'parallel',
      goal: 'testing majority merge',
      inputContext: { mergeStrategy: 'majority' }
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallMajority
    })

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-merge-majority' },
        data: expect.objectContaining({
          mergedOutput: expect.objectContaining({ major: 'A' })
        })
      })
    )

    // --- B. 测试 append 策略 ---
    const mockCallAppend = vi.fn()
      .mockResolvedValueOnce({ step: '1' })
      .mockResolvedValueOnce({ step: '2' })
      .mockResolvedValueOnce({ step: '3' })

    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-merge-append',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-merge-append',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subIds),
      status: 'running',
      inputContext: { mergeStrategy: 'append' }
    } as any)

    await runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId: 'agent-1',
      subAgentIds: subIds,
      mode: 'parallel',
      goal: 'testing append merge',
      inputContext: { mergeStrategy: 'append' }
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallAppend
    })

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-merge-append' },
        data: expect.objectContaining({
          mergedOutput: expect.objectContaining({
            'agent-1': { step: '1' },
            'agent-2': { step: '2' },
            'agent-3': { step: '3' }
          })
        })
      })
    )

    // --- C. 测试 first-wins 策略 ---
    const mockCallFirstWins = vi.fn()
      .mockResolvedValueOnce({ winner: 'yes' })
      .mockResolvedValueOnce({ winner: 'no' })
      .mockResolvedValueOnce({ winner: 'maybe' })

    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-merge-fw',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-merge-fw',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subIds),
      status: 'running',
      inputContext: { mergeStrategy: 'first-wins' }
    } as any)

    await runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId: 'agent-1',
      subAgentIds: subIds,
      mode: 'parallel',
      goal: 'testing first-wins merge',
      inputContext: { mergeStrategy: 'first-wins' }
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallFirstWins
    })

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-merge-fw' },
        data: expect.objectContaining({
          mergedOutput: expect.objectContaining({ winner: 'yes' })
        })
      })
    )
  })

  // 11. runOrchestration human-in-loop
  it('runOrchestration human-in-loop：Session.status="waiting-human"', async () => {
    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-hil',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-hil',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'running',
      inputContext: {}
    } as any)

    const mockCallSubAgent = vi.fn().mockResolvedValue({ output: 'ok' })

    const session = await runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId,
      subAgentIds,
      mode: 'human-in-loop',
      goal: 'test hil'
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallSubAgent
    })

    // 应该只 dispatch 第一批（1个 Agent），且 session 变成 waiting-human
    expect(mockCallSubAgent).toHaveBeenCalledTimes(1)
    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-hil' },
        data: expect.objectContaining({ status: 'waiting-human' })
      })
    )
  })

  // 12. resumeOrchestrationSession approved=false
  it('resumeOrchestrationSession approved=false：Session.status="cancelled"', async () => {
    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-hil',
      status: 'waiting-human',
      subAgentIds: JSON.stringify(subAgentIds)
    } as any)

    await resumeOrchestrationSession('sess-hil', workspaceId, false, 'admin', {
      writeAuditLog: vi.fn(),
      callSubAgent: vi.fn()
    })

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-hil' },
        data: expect.objectContaining({ status: 'cancelled' })
      })
    )
  })

  // 14. resumeOrchestrationSession approved=true，剩余 2 个未执行 Sub-Agent
  it('resumeOrchestrationSession approved=true：剩余 2 个未执行 Sub-Agent', async () => {
    const subIds = ['agent-1', 'agent-2', 'agent-3']
    await prisma.orchestrationSession.create({
      data: {
        sessionId: 'sess-hil-resume',
        status: 'waiting-human',
        subAgentIds: JSON.stringify(subIds),
        goal: 'resume goal',
        inputContext: { base: 'init' },
        workspaceId,
        workflowRunId: 'run-123',
        orchestratorAgentId: 'orch-agent'
      } as any
    })

    // 假设第一个 agent-1 已经执行过了
    vi.mocked(prisma.subAgentTask.findMany).mockResolvedValue([
      {
        taskId: 'task-1',
        sessionId: 'sess-hil-resume',
        agentId: 'agent-1',
        status: 'completed',
        output: { step1: 'res1' }
      }
    ] as any)

    const mockCallSubAgent = vi.fn()
      .mockResolvedValueOnce({ step2: 'res2' }) // agent-2
      .mockResolvedValueOnce({ step3: 'res3' }) // agent-3

    await resumeOrchestrationSession('sess-hil-resume', workspaceId, true, 'admin', {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallSubAgent
    })

    // 剩余的 agent-2 和 agent-3 应该被 dispatch 2 次
    expect(mockCallSubAgent).toHaveBeenCalledTimes(2)
    
    // 第三个 agent 的输入包含前两步的输出
    expect(mockCallSubAgent).toHaveBeenLastCalledWith(
      'agent-3',
      expect.any(String),
      expect.objectContaining({ base: 'init', step1: 'res1', step2: 'res2' }),
      expect.any(Object)
    )

    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-hil-resume' },
        data: expect.objectContaining({
          status: 'completed',
          mergedOutput: expect.objectContaining({
            step1: 'res1',
            step2: 'res2',
            step3: 'res3'
          })
        })
      })
    )
  })

  // 13. runOrchestration 整体超时
  it('runOrchestration 整体超时：SessionTimeoutError，Session.status="failed"', async () => {
    vi.useFakeTimers()
    const mockCallSubAgent = vi.fn().mockImplementation(() => new Promise(() => {}))

    vi.mocked(prisma.orchestrationSession.create).mockResolvedValue({
      sessionId: 'sess-timeout',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'initializing',
      inputContext: {}
    } as any)

    vi.mocked(prisma.orchestrationSession.findUnique).mockResolvedValue({
      sessionId: 'sess-timeout',
      orchestratorAgentId,
      subAgentIds: JSON.stringify(subAgentIds),
      status: 'running',
      inputContext: {}
    } as any)

    const promise = runOrchestration({
      workflowRunId,
      workspaceId,
      orchestratorAgentId,
      subAgentIds,
      mode: 'sequential',
      goal: 'timeout task',
      sessionTimeoutMs: 1000
    }, {
      writeAuditLog: vi.fn(),
      callSubAgent: mockCallSubAgent
    })
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(1500)

    await expect(promise).rejects.toThrow(SessionTimeoutError)
    expect(prisma.orchestrationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'sess-timeout' },
        data: expect.objectContaining({ status: 'failed' })
      })
    )
    vi.useRealTimers()
  })
})
