import { createTrace, withTraceStep, finalizeTrace } from '../reasoning-trace'
import { describe, test, expect } from 'vitest'

describe('withTraceStep', () => {

  test('业务成功时 step 状态为 passed', async () => {
    const trace = createTrace({ conversationId: 'c1', workspaceId: 'w1' })
    const result = await withTraceStep(
      trace,
      { type: 'intent.parse', label: '测试步骤' },
      async (step) => {
        step._pendingUpdate = { outputs: { foo: 'bar' } }
        return 'ok'
      }
    )
    expect(result).toBe('ok')
    expect(trace.steps).toHaveLength(1)
    expect(trace.steps[0].status).toBe('passed')
    expect(trace.steps[0].outputs).toEqual({ foo: 'bar' })
    expect(trace.steps[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  test('业务抛错时 step 状态为 error，且业务异常正常向外传播', async () => {
    const trace = createTrace({ conversationId: 'c1', workspaceId: 'w1' })
    await expect(
      withTraceStep(
        trace,
        { type: 'guardrail.check', label: '护栏测试' },
        async () => { throw new Error('db connection failed') }
      )
    ).rejects.toThrow('db connection failed')

    expect(trace.steps[0].status).toBe('error')
    expect(trace.steps[0].outputs?.errorMessage).toContain('db connection failed')
    expect(trace.steps[0].completedAt).toBeDefined()
  })

  test('trace 为 null 时直接执行业务逻辑，不产生 trace', async () => {
    const result = await withTraceStep(
      null,
      { type: 'model.route', label: '空 trace 测试' },
      async () => 42
    )
    expect(result).toBe(42)
  })

  test('inputs 中的敏感字段被脱敏', async () => {
    const trace = createTrace({ conversationId: 'c1', workspaceId: 'w1' })
    await withTraceStep(
      trace,
      {
        type: 'connector.call',
        label: '脱敏测试',
        inputs: { username: 'admin', password: 'super-secret', data: 'hello' },
      },
      async () => 'done'
    )
    expect(trace.steps[0].inputs?.password).toBe('[REDACTED]')
    expect(trace.steps[0].inputs?.data).toBe('hello')
  })

  test('step._pendingUpdate.status = blocked 时正确写入', async () => {
    const trace = createTrace({ conversationId: 'c1', workspaceId: 'w1' })
    await withTraceStep(
      trace,
      { type: 'guardrail.check', label: '拦截测试' },
      async (step) => {
        step._pendingUpdate = {
          status: 'blocked',
          blockedReason: '超出 L3 自动化等级，需要人工审批',
        }
        return { blocked: true }
      }
    )
    expect(trace.steps[0].status).toBe('blocked')
    expect(trace.steps[0].blockedReason).toBe('超出 L3 自动化等级，需要人工审批')
  })

})
