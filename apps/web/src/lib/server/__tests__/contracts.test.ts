import { expect, describe, it } from 'vitest';
import {
  createTaskEnvelope,
  isHighRiskWithoutReceipt,
  isCheckpointExpired,
  generateReceiptHash,
  type TaskEnvelope,
  type ExecutionEvent,
  type ActionReceipt,
  type CapabilityRegistration,
  type ConnectorLease,
  type HumanApprovalCheckpoint
} from '@hermesclaw/event-contracts';

describe('Contracts Layer Tests', () => {
  it('should correctly createTaskEnvelope and fill default fields', () => {
    const params = {
      workflowRunId: 'wf-123',
      workspaceId: 'ws-123',
      industryId: 'ind-123',
      agentId: 'agt-123',
      actionType: 'connector.execute',
      input: { query: 'test' },
      automationLevel: 'L2' as const,
      riskLevel: 'medium' as const,
      callbackTarget: 'http://callback',
      policySnapshotVersion: 'v1.0'
    };

    const envelope = createTaskEnvelope(params);
    expect(envelope.taskId).toBeDefined();
    expect(envelope.idempotencyKey).toBeDefined();
    expect(envelope.createdAt).toBeInstanceOf(Date);
    expect(envelope.version).toBe('1.0.0');
    expect(envelope.workflowRunId).toBe('wf-123');
  });

  it('should identify high risk without receipt', () => {
    expect(isHighRiskWithoutReceipt(null)).toBe(true);
    expect(isHighRiskWithoutReceipt(undefined)).toBe(true);

    const validReceipt: ActionReceipt = {
      receiptId: 'rcpt-123',
      taskId: 'task-123',
      workflowRunId: 'wf-123',
      connectorId: 'conn-123',
      status: 'success',
      executedAt: new Date(),
      durationMs: 120,
      receiptHash: 'hash-abc',
      compensationStrategy: {
        type: 'none'
      },
      idempotencyKey: 'idem-123',
      isIrreversible: false
    };

    expect(isHighRiskWithoutReceipt(validReceipt)).toBe(false);
  });

  it('should detect checkpoint expiration correctly', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 10000); // 10s ago
    const futureDate = new Date(now.getTime() + 10000); // 10s later

    const expiredCheckpoint: HumanApprovalCheckpoint = {
      checkpointId: 'cp-123',
      workspaceId: 'ws-123',
      decision: 'pending',
      triggerReason: 'risk.level.high',
      requestedAt: now,
      expiresAt: pastDate,
      riskLevel: 'high',
      automationLevel: 'L3',
      actionSummary: 'Test summary',
      inputSnapshot: {},
      policySnapshotVersion: 'v1.0'
    };

    const nonExpiredCheckpoint: HumanApprovalCheckpoint = {
      ...expiredCheckpoint,
      expiresAt: futureDate
    };

    const approvedCheckpoint: HumanApprovalCheckpoint = {
      ...expiredCheckpoint,
      decision: 'approved',
      expiresAt: pastDate
    };

    expect(isCheckpointExpired(expiredCheckpoint)).toBe(true);
    expect(isCheckpointExpired(nonExpiredCheckpoint)).toBe(false);
    expect(isCheckpointExpired(approvedCheckpoint)).toBe(false);
  });

  it('should verify contract interfaces have required fields (compile time check)', () => {
    const envelope: TaskEnvelope = {
      taskId: 'taskId',
      workflowRunId: 'workflowRunId',
      workspaceId: 'workspaceId',
      industryId: 'industryId',
      agentId: 'agentId',
      actionType: 'workflow.run',
      input: {},
      automationLevel: 'L1',
      riskLevel: 'low',
      idempotencyKey: 'idempotencyKey',
      callbackTarget: 'callbackTarget',
      policySnapshotVersion: 'policySnapshotVersion',
      version: '1.0',
      createdAt: new Date()
    };

    const event: ExecutionEvent = {
      eventId: 'eventId',
      taskId: 'taskId',
      workflowRunId: 'workflowRunId',
      runtimeId: 'runtimeId',
      eventType: 'run.started',
      status: 'pending',
      timestamp: new Date(),
      payload: {},
      version: '1.0'
    };

    const receipt: ActionReceipt = {
      receiptId: 'receiptId',
      taskId: 'taskId',
      workflowRunId: 'workflowRunId',
      connectorId: 'connectorId',
      status: 'success',
      executedAt: new Date(),
      durationMs: 100,
      receiptHash: 'receiptHash',
      compensationStrategy: {
        type: 'none'
      },
      idempotencyKey: 'idempotencyKey',
      isIrreversible: false
    };

    const capability: CapabilityRegistration = {
      capabilityId: 'capabilityId',
      runtimeId: 'runtimeId',
      workspaceId: 'workspaceId',
      type: 'connector',
      name: 'name',
      version: '1.0',
      status: 'available',
      supportedActionTypes: ['connector.execute'],
      automationLevelCeiling: 'L4',
      riskLevelCeiling: 'critical',
      registeredAt: new Date(),
      lastHeartbeatAt: new Date()
    };

    const lease: ConnectorLease = {
      leaseId: 'leaseId',
      connectorId: 'connectorId',
      taskId: 'taskId',
      workspaceId: 'workspaceId',
      workflowRunId: 'workflowRunId',
      status: 'active',
      grantedAt: new Date(),
      expiresAt: new Date(),
      maxRetries: 3,
      currentRetries: 0,
      idempotencyKey: 'idempotencyKey'
    };

    const checkpoint: HumanApprovalCheckpoint = {
      checkpointId: 'checkpointId',
      workspaceId: 'workspaceId',
      decision: 'pending',
      triggerReason: 'risk.level.high',
      requestedAt: new Date(),
      expiresAt: new Date(),
      riskLevel: 'high',
      automationLevel: 'L3',
      actionSummary: 'actionSummary',
      inputSnapshot: {},
      policySnapshotVersion: 'policySnapshotVersion'
    };

    expect(envelope.taskId).toBe('taskId');
    expect(event.eventId).toBe('eventId');
    expect(receipt.receiptId).toBe('receiptId');
    expect(capability.capabilityId).toBe('capabilityId');
    expect(lease.leaseId).toBe('leaseId');
    expect(checkpoint.checkpointId).toBe('checkpointId');
  });

  it('should generate hash consistently for ActionReceipt', () => {
    const record = {
      receiptId: 'rcpt-1',
      taskId: 'task-1',
      status: 'success' as const,
      executedAt: new Date('2026-06-15T10:00:00.000Z')
    };
    const hash = generateReceiptHash(record);
    expect(hash).toBeDefined();
    expect(generateReceiptHash(record)).toBe(hash);
  });
});
