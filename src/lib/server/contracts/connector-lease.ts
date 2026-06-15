export type LeaseStatus = 'active' | 'expired' | 'revoked' | 'pending';

export interface ConnectorLease {
  leaseId: string;
  connectorId: string;
  taskId: string;
  workspaceId: string;
  workflowRunId: string;
  status: LeaseStatus;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
  maxRetries: number;
  currentRetries: number;
  idempotencyKey: string;
}
