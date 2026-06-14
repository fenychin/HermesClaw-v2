import { describe, it, expect, vi } from 'vitest'
import { runDag } from '../dag-engine'
import type { WorkflowDefinition, WorkflowRunContext, NodeHandler, DagEngineHooks } from '../dag-types'

describe('DAG Engine 纯编排单元测试', () => {
  // 构造基础 Context
  const createContext = (variables: Record<string, unknown> = {}): WorkflowRunContext => ({
    runId: 'test-run-id',
    workflowId: 'test-workflow-id',
    trigger: 'manual',
    variables,
    nodeOutputs: {},
    actor: 'test-actor',
    depth: 0,
    workspaceId: 'test-workspace',
    industryId: 'foreign-trade',
  })

  // 1. 测试拓扑排序环路检测
  it('应当能检测出拓扑环路并抛出清晰的错误', async () => {
    const def: WorkflowDefinition = {
      id: 'loop-wf',
      name: 'Loop Workflow',
      nodes: [
        { id: 'A', kind: 'noop', name: 'Node A' },
        { id: 'B', kind: 'noop', name: 'Node B' },
        { id: 'C', kind: 'noop', name: 'Node C' },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' }, // 闭环
      ],
    }

    const ctx = createContext()
    await expect(runDag(def, ctx)).rejects.toThrow('DAG 环路检测失败')
  })

  // 2. 线性工作流测试
  it('应当按拓扑顺序串行执行线性工作流并正确传递输出', async () => {
    const def: WorkflowDefinition = {
      id: 'linear-wf',
      name: 'Linear Workflow',
      nodes: [
        { id: 'A', kind: 'task', name: 'Node A' },
        { id: 'B', kind: 'task', name: 'Node B' },
      ],
      edges: [{ from: 'A', to: 'B' }],
    }

    const handlerA: NodeHandler = async () => ({
      status: 'completed',
      output: { value: 100 },
    })

    const handlerB: NodeHandler = async (node, ctx) => {
      const prevOutput = (ctx.nodeOutputs['A'] as { value: number }).value
      return {
        status: 'completed',
        output: { result: prevOutput + 50 },
      }
    }

    const ctx = createContext()
    const hooks: DagEngineHooks = {
      onNodeStart: vi.fn(),
      onNodeFinish: vi.fn(),
      onWorkflowComplete: vi.fn(),
    }

    const status = await runDag(def, ctx, {
      handlers: {
        task: async (node) => {
          if (node.id === 'A') return handlerA(node, ctx)
          return handlerB(node, ctx)
        },
      },
    }, hooks)

    expect(status).toBe('completed')
    expect(ctx.nodeOutputs['A']).toEqual({ value: 100 })
    expect(ctx.nodeOutputs['B']).toEqual({ result: 150 })

    expect(hooks.onNodeStart).toHaveBeenCalledTimes(2)
    expect(hooks.onNodeFinish).toHaveBeenCalledTimes(2)
    expect(hooks.onWorkflowComplete).toHaveBeenCalledWith(ctx, 'completed')
  })

  // 3. 条件节点测试 (正常流程与变量异常流程)
  it('条件节点能正确比对并流转到对应分支', async () => {
    const def: WorkflowDefinition = {
      id: 'cond-wf',
      name: 'Condition Workflow',
      nodes: [
        {
          id: 'cond',
          kind: 'condition',
          name: 'Is Admin',
          config: {
            variable: 'isAdmin',
            expected: 'true',
            trueBranch: 'yes',
            falseBranch: 'no',
          },
        },
        { id: 'A', kind: 'noop', name: 'Admin Node' },
        { id: 'B', kind: 'noop', name: 'User Node' },
      ],
      edges: [
        { from: 'cond', to: 'A', when: 'yes' },
        { from: 'cond', to: 'B', when: 'no' },
      ],
    }

    // isAdmin = true 走向 A，跳过 B
    const ctx1 = createContext({ isAdmin: 'true' })
    const hooks1 = {
      onNodeFinish: vi.fn(),
    }
    const status1 = await runDag(def, ctx1, {}, hooks1)
    expect(status1).toBe('completed')
    expect(ctx1.nodeOutputs['A']).toBeNull() // completed
    expect(ctx1.nodeOutputs['__skipped__B']).toBe(true) // skipped

    // B 的 onNodeFinish 钩子应该被调用，状态为 skipped
    expect(hooks1.onNodeFinish).toHaveBeenCalledWith('B', ctx1, expect.objectContaining({
      status: 'skipped',
    }))

    // isAdmin = false 走向 B，跳过 A
    const ctx2 = createContext({ isAdmin: 'false' })
    const hooks2 = {
      onNodeFinish: vi.fn(),
    }
    const status2 = await runDag(def, ctx2, {}, hooks2)
    expect(status2).toBe('completed')
    expect(ctx2.nodeOutputs['B']).toBeNull()
    expect(ctx2.nodeOutputs['__skipped__A']).toBe(true)
  })

  it('条件节点缺少变量配置时应当标记为 failed 并触发审计', async () => {
    const def: WorkflowDefinition = {
      id: 'cond-wf-fail',
      name: 'Condition Workflow Fail',
      nodes: [
        {
          id: 'cond',
          kind: 'condition',
          name: 'Missing Config',
          config: {}, // 缺少 variable
        },
        { id: 'A', kind: 'noop', name: 'Node A' },
      ],
      edges: [{ from: 'cond', to: 'A', when: 'true' }],
    }

    const ctx = createContext()
    const hooks = {
      onNodeFinish: vi.fn(),
      onWorkflowComplete: vi.fn(),
    }
    const status = await runDag(def, ctx, {}, hooks)

    expect(status).toBe('failed')
    expect(hooks.onNodeFinish).toHaveBeenCalledWith('cond', ctx, expect.objectContaining({
      status: 'failed',
      error: expect.stringContaining('缺少 config.variable 配置'),
    }))
    expect(hooks.onNodeFinish).toHaveBeenCalledWith('A', ctx, expect.objectContaining({
      status: 'skipped',
      error: expect.stringContaining('上游节点 cond 失败'),
    }))
    expect(hooks.onWorkflowComplete).toHaveBeenCalledWith(ctx, 'failed')
  })

  it('条件节点在 variables 中找不到目标变量时应当标记为 failed', async () => {
    const def: WorkflowDefinition = {
      id: 'cond-wf-missing-var',
      name: 'Condition Workflow Missing Var',
      nodes: [
        {
          id: 'cond',
          kind: 'condition',
          name: 'Check Status',
          config: { variable: 'status', expected: 'active' },
        },
        { id: 'A', kind: 'noop', name: 'Node A' },
      ],
      edges: [{ from: 'cond', to: 'A', when: 'true' }],
    }

    // ctx.variables 中无 'status' 变量
    const ctx = createContext({})
    const hooks = {
      onNodeFinish: vi.fn(),
    }
    const engineStatus = await runDag(def, ctx, {}, hooks)

    expect(engineStatus).toBe('failed')
    expect(hooks.onNodeFinish).toHaveBeenCalledWith('cond', ctx, expect.objectContaining({
      status: 'failed',
      error: expect.stringContaining('无法在上下文中找到变量'),
    }))
  })

  // 4. 递归 skip 传播测试 (分支被剪枝)
  it('条件未满足时，未激活分支的整个子树（多级后继）均应被递归 skip', async () => {
    // 结构： cond -> A (when: 'yes') -> B -> C
    //               -> D (when: 'no')
    const def: WorkflowDefinition = {
      id: 'tree-skip-wf',
      name: 'Tree Skip Workflow',
      nodes: [
        {
          id: 'cond',
          kind: 'condition',
          name: 'Check Cond',
          config: {
            variable: 'flag',
            expected: 'yes',
            trueBranch: 'yes',
            falseBranch: 'no',
          },
        },
        { id: 'A', kind: 'noop', name: 'Node A' },
        { id: 'B', kind: 'noop', name: 'Node B' },
        { id: 'C', kind: 'noop', name: 'Node C' },
        { id: 'D', kind: 'noop', name: 'Node D' },
      ],
      edges: [
        { from: 'cond', to: 'A', when: 'yes' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'cond', to: 'D', when: 'no' },
      ],
    }

    // flag = 'no'，则走向 D，跳过 A，递归跳过 B 和 C
    const ctx = createContext({ flag: 'no' })
    const hooks = {
      onNodeFinish: vi.fn(),
    }
    const status = await runDag(def, ctx, {}, hooks)

    expect(status).toBe('completed')
    expect(ctx.nodeOutputs['D']).toBeNull()
    expect(ctx.nodeOutputs['__skipped__A']).toBe(true)
    expect(ctx.nodeOutputs['__skipped__B']).toBe(true)
    expect(ctx.nodeOutputs['__skipped__C']).toBe(true)

    // B 和 C 的 onNodeFinish 钩子都被执行，且状态为 skipped
    expect(hooks.onNodeFinish).toHaveBeenCalledWith('B', ctx, expect.objectContaining({ status: 'skipped' }))
    expect(hooks.onNodeFinish).toHaveBeenCalledWith('C', ctx, expect.objectContaining({ status: 'skipped' }))
  })

  // 5. 故障扩散控制与独立分支测试
  it('某节点执行失败时，其所有后继节点应被递归 skip，但独立分支应不受影响继续完成', async () => {
    // 结构： A -> B (failed) -> D
    //       A -> C (completed)
    const def: WorkflowDefinition = {
      id: 'fault-spread-wf',
      name: 'Fault Spread Workflow',
      nodes: [
        { id: 'A', kind: 'noop', name: 'Node A' },
        { id: 'B', kind: 'task', name: 'Node B' },
        { id: 'C', kind: 'noop', name: 'Node C' },
        { id: 'D', kind: 'noop', name: 'Node D' },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'B', to: 'D' },
      ],
    }

    const ctx = createContext()
    const hooks = {
      onNodeFinish: vi.fn(),
    }

    const status = await runDag(def, ctx, {
      handlers: {
        task: async () => ({
          status: 'failed',
          error: 'Node B execution error',
        }),
      },
    }, hooks)

    expect(status).toBe('failed')
    expect(ctx.nodeOutputs['A']).toBeNull()
    expect(ctx.nodeOutputs['C']).toBeNull() // 独立分支 C 正常完成
    expect(ctx.nodeOutputs['__skipped__D']).toBe(true) // 后继节点 D 被递归 skip

    expect(hooks.onNodeFinish).toHaveBeenCalledWith('C', ctx, expect.objectContaining({ status: 'completed' }))
    expect(hooks.onNodeFinish).toHaveBeenCalledWith('D', ctx, expect.objectContaining({
      status: 'skipped',
      error: expect.stringContaining('上游节点 B 失败'),
    }))
  })
})
