import { describe, it, expect } from 'vitest'
import * as openclawAdapter from '../index'

describe('openclaw-adapter smoke', () => {
  it('can be imported and exports expected symbols', () => {
    expect(openclawAdapter).toBeDefined()
    expect(typeof openclawAdapter.createOpenClawAdapter).toBe('function')
    expect(typeof openclawAdapter.createGatewayClient).toBe('function')
    expect(typeof openclawAdapter.getConnectors).toBe('function')
    expect(typeof openclawAdapter.updateConnector).toBe('function')
  })

  it('createOpenClawAdapter returns ExecutionAdapter with all 3 methods', () => {
    const adapter = openclawAdapter.createOpenClawAdapter({
      baseUrl: 'http://localhost:8001',
      apiKey: 'test-key',
    })

    expect(adapter).toBeDefined()
    expect(typeof adapter.dispatch).toBe('function')
    expect(typeof adapter.subscribe).toBe('function')
    expect(typeof adapter.getStatus).toBe('function')
  })

  it('dispatch returns { eventId }', async () => {
    const adapter = openclawAdapter.createOpenClawAdapter({
      baseUrl: 'http://localhost:8001',
      apiKey: 'test-key',
      useMock: true,
    })

    const result = await adapter.dispatch({
      taskId: 'test-task-1',
      workflowRunId: 'test-run-1',
      workspaceId: 'test-ws-1',
      industryId: 'test-industry-1',
      agentId: 'test-agent-1',
      actionType: 'email.send',
      input: { taskName: '测试任务' },
      automationLevel: 'L2',
      riskLevel: 'low',
      idempotencyKey: 'idem-test-1',
      callbackTarget: 'test-callback',
      policySnapshotVersion: '1.0.0',
      version: '1.0.0',
    })

    expect(result).toBeDefined()
    expect(typeof result.eventId).toBe('string')
    expect(result.eventId).toMatch(/^evt-/)
  })

  it('getStatus returns current status', async () => {
    const adapter = openclawAdapter.createOpenClawAdapter({
      baseUrl: 'http://localhost:8001',
      apiKey: 'test-key',
      useMock: true,
    })

    await adapter.dispatch({
      taskId: 'test-task-2',
      workflowRunId: 'test-run-2',
      workspaceId: 'test-ws-2',
      industryId: 'test-industry-2',
      agentId: 'test-agent-2',
      actionType: 'skill.test',
      input: { taskName: '测试' },
      automationLevel: 'L2',
      riskLevel: 'low',
      idempotencyKey: 'idem-test-2',
      callbackTarget: 'test-callback',
      policySnapshotVersion: '1.0.0',
      version: '1.0.0',
    })

    const status = await adapter.getStatus('test-task-2')
    expect(status).not.toBeNull()
    expect(['started', 'progress', 'completed', 'failed']).toContain(status)
  })

  it('subscribe returns unsubscribe function', () => {
    const adapter = openclawAdapter.createOpenClawAdapter({
      baseUrl: 'http://localhost:8001',
      apiKey: 'test-key',
    })

    const handler = () => {}
    const unsubscribe = adapter.subscribe('test-task-3', handler)
    expect(typeof unsubscribe).toBe('function')

    // 应该不抛异常
    expect(() => unsubscribe()).not.toThrow()
  })
})
