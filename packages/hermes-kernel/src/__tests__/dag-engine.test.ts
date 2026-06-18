import { describe, it, expect, vi } from 'vitest'
import type { TaskEnvelope } from '@hermesclaw/event-contracts'
import {
  runDag,
  buildDagFromWorkflowTemplate,
  type DagContext,
  type DagNode,
  type DagPrismaClient,
} from '../orchestration'

/**
 * 构造一个 DagContext，prisma 用 vitest mock 替身。
 * 测试需要校验 stepLogs.push 写入次数、状态翻转 update 调用，所以把 mock 暴露出去。
 */
function makeCtx(): {
  ctx: DagContext
  updateMock: ReturnType<typeof vi.fn>
} {
  const updateMock = vi.fn(async () => ({}))
  const prisma: DagPrismaClient = {
    workflowRun: { update: updateMock },
  }
  const ctx: DagContext = {
    workspaceId: 'ws-test',
    workflowRunId: 'run-test',
    // 测试只关心拓扑/失败传播，不依赖 envelope 字段；使用 unknown 中转避免 any。
    taskEnvelope: {} as unknown as TaskEnvelope,
    nodeOutputs: new Map<string, unknown>(),
    prisma,
  }
  return { ctx, updateMock }
}

describe('runDag — Scenario 1: linear 3 nodes execute in order', () => {
  it('A → B → C runs sequentially and all complete', async () => {
    const order: string[] = []
    const nodes: DagNode[] = [
      {
        id: 'A',
        deps: [],
        action: async () => {
          order.push('A')
          return { status: 'completed', output: { v: 1 } }
        },
      },
      {
        id: 'B',
        deps: ['A'],
        action: async () => {
          order.push('B')
          return { status: 'completed', output: { v: 2 } }
        },
      },
      {
        id: 'C',
        deps: ['B'],
        action: async () => {
          order.push('C')
          return { status: 'completed', output: { v: 3 } }
        },
      },
    ]
    const { ctx, updateMock } = makeCtx()
    const result = await runDag(nodes, ctx)

    expect(order).toEqual(['A', 'B', 'C'])
    expect(result.status).toBe('completed')
    expect(result.nodeResults.get('A')?.status).toBe('completed')
    expect(result.nodeResults.get('B')?.status).toBe('completed')
    expect(result.nodeResults.get('C')?.status).toBe('completed')
    // 每个节点至少 2 次（start + completed）共 6 次 + 终态 update 1 次。
    expect(updateMock).toHaveBeenCalled()
    // 终态写入：status: 'completed'
    const calls = updateMock.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall?.[0]?.data?.status).toBe('completed')
  })
})

describe('runDag — Scenario 2: parallel 2 nodes converging into 1', () => {
  it('A and B run concurrently, then C runs after both finish', async () => {
    let aStart = 0
    let aEnd = 0
    let bStart = 0
    let bEnd = 0
    let cStart = 0

    const nodes: DagNode[] = [
      {
        id: 'A',
        deps: [],
        action: async () => {
          aStart = Date.now()
          await new Promise((r) => setTimeout(r, 60))
          aEnd = Date.now()
          return { status: 'completed' }
        },
      },
      {
        id: 'B',
        deps: [],
        action: async () => {
          bStart = Date.now()
          await new Promise((r) => setTimeout(r, 60))
          bEnd = Date.now()
          return { status: 'completed' }
        },
      },
      {
        id: 'C',
        deps: ['A', 'B'],
        action: async () => {
          cStart = Date.now()
          return { status: 'completed' }
        },
      },
    ]
    const { ctx } = makeCtx()
    const result = await runDag(nodes, ctx)

    expect(result.status).toBe('completed')
    // 并发判定：A 与 B 的执行时间窗有交集（max(start) < min(end)）。
    expect(Math.max(aStart, bStart)).toBeLessThan(Math.min(aEnd, bEnd))
    // 汇聚节点 C 在 A、B 都完成之后启动。
    expect(cStart).toBeGreaterThanOrEqual(Math.max(aEnd, bEnd))
  })
})

describe('runDag — Scenario 3: failure propagation skips downstream only', () => {
  it('B fails → C (depends on B) skipped, D (parallel sibling) still completes', async () => {
    const dRan = vi.fn()
    const cRan = vi.fn()
    const nodes: DagNode[] = [
      { id: 'A', deps: [], action: async () => ({ status: 'completed' }) },
      {
        id: 'B',
        deps: ['A'],
        action: async () => ({ status: 'failed', error: 'boom' }),
      },
      {
        id: 'C',
        deps: ['B'],
        action: async () => {
          cRan()
          return { status: 'completed' }
        },
      },
      {
        id: 'D',
        deps: ['A'],
        action: async () => {
          dRan()
          return { status: 'completed' }
        },
      },
    ]
    const { ctx, updateMock } = makeCtx()
    const result = await runDag(nodes, ctx)

    expect(result.nodeResults.get('A')?.status).toBe('completed')
    expect(result.nodeResults.get('B')?.status).toBe('failed')
    expect(result.nodeResults.get('B')?.error).toBe('boom')
    expect(result.nodeResults.get('C')?.status).toBe('skipped')
    expect(result.nodeResults.get('D')?.status).toBe('completed')

    // C 不应被实际调用（skipped 不调 action），D 必须被调用。
    expect(cRan).not.toHaveBeenCalled()
    expect(dRan).toHaveBeenCalledTimes(1)

    // 整体状态：有完成也有失败 → partial；落库时映射成 'failed'。
    expect(result.status).toBe('partial')
    const calls = updateMock.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall?.[0]?.data?.status).toBe('failed')
  })
})

describe('runDag — Scenario 4: cyclic DAG rejected', () => {
  it('A → B → A cycle throws an Error', async () => {
    const nodes: DagNode[] = [
      { id: 'A', deps: ['B'], action: async () => ({ status: 'completed' }) },
      { id: 'B', deps: ['A'], action: async () => ({ status: 'completed' }) },
    ]
    const { ctx } = makeCtx()
    await expect(runDag(nodes, ctx)).rejects.toThrow(/cycle/i)
  })

  it('rejects when a node references a missing dependency', async () => {
    const nodes: DagNode[] = [
      { id: 'A', deps: ['ghost'], action: async () => ({ status: 'completed' }) },
    ]
    const { ctx } = makeCtx()
    await expect(runDag(nodes, ctx)).rejects.toThrow(/missing/i)
  })
})

describe('buildDagFromWorkflowTemplate', () => {
  it('maps WorkflowStep[] to DagNode[] preserving dependencies', () => {
    const dag = buildDagFromWorkflowTemplate([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: ['a'] },
      { id: 'c', type: 'agent-call', dependencies: ['a', 'b'] },
    ])
    expect(dag).toHaveLength(3)
    expect(dag[0]?.deps).toEqual([])
    expect(dag[1]?.deps).toEqual(['a'])
    expect(dag[2]?.deps).toEqual(['a', 'b'])
    expect(typeof dag[0]?.action).toBe('function')
  })

  it('treats missing dependencies field as empty array', () => {
    const dag = buildDagFromWorkflowTemplate([{ id: 'solo' }])
    expect(dag[0]?.deps).toEqual([])
  })

  it('produced default action returns a completed result with stepId in output', async () => {
    const dag = buildDagFromWorkflowTemplate([
      { id: 'x', type: 'skill-call', dependencies: [] },
    ])
    const { ctx } = makeCtx()
    const result = await dag[0]!.action(ctx)
    expect(result.status).toBe('completed')
    expect(result.output).toEqual({ stepId: 'x', type: 'skill-call' })
  })
})
