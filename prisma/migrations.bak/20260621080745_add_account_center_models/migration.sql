/*
  Warnings:

  - You are about to drop the column `canaryConfig` on the `HarnessProposal` table. All the data in the column will be lost.
  - You are about to alter the column `previousSnapshot` on the `HarnessProposal` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `envelopeSnapshot` on the `WorkflowRun` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - Added the required column `runId` to the `WorkflowRun` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `WorkflowRun` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "industryId" TEXT;
ALTER TABLE "Agent" ADD COLUMN "templateId" TEXT;

-- AlterTable
ALTER TABLE "AgentLog" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "MemoryRevision" ADD COLUMN "proposalId" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN "industryId" TEXT;
ALTER TABLE "Workflow" ADD COLUMN "templateId" TEXT;

-- CreateTable
CREATE TABLE "ReasoningTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "steps" JSONB NOT NULL,
    "totalDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StepRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputData" JSONB NOT NULL DEFAULT '{}',
    "outputData" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "agentId" TEXT,
    "capabilityId" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "parentStepId" TEXT,
    "childStepIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StepRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun" ("runId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrchestrationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "orchestratorAgentId" TEXT NOT NULL,
    "subAgentIds" TEXT NOT NULL DEFAULT '[]',
    "mode" TEXT NOT NULL DEFAULT 'sequential',
    "status" TEXT NOT NULL DEFAULT 'initializing',
    "goal" TEXT NOT NULL,
    "inputContext" JSONB NOT NULL DEFAULT '{}',
    "mergedOutput" JSONB,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "failureReason" TEXT,
    "humanInterventionReason" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SubAgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "inputData" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubAgentTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OrchestrationSession" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "toAgentId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT,
    "taskId" TEXT,
    "stepId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "protocolVersion" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApprovalCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkpointId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT,
    "workflowRunId" TEXT,
    "proposalId" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "triggerReason" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "automationLevel" TEXT NOT NULL,
    "actionSummary" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "policySnapshotVersion" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "requiredSigners" TEXT,
    "signedList" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HarnessSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "proposalId" TEXT,
    "snapshotType" TEXT NOT NULL DEFAULT 'pre-canary',
    "agentConfig" JSONB NOT NULL,
    "workflowTemplates" JSONB NOT NULL,
    "skillBindings" JSONB NOT NULL,
    "connectorBindings" JSONB NOT NULL,
    "memoryPolicy" JSONB,
    "policySnapshotVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "restoredAt" DATETIME,
    "restoredBy" TEXT
);

-- CreateTable
CREATE TABLE "HarnessCanary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canaryId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "trafficPercent" INTEGER NOT NULL DEFAULT 10,
    "observationWindowMs" INTEGER NOT NULL DEFAULT 86400000,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "promotedAt" DATETIME,
    "promotedBy" TEXT,
    "rolledBackAt" DATETIME,
    "rolledBackBy" TEXT,
    "rollbackReason" TEXT,
    "observationMetrics" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HarnessRollback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rollbackId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "canaryId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'system',
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "restoredFields" JSONB NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CapabilityVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capabilityId" TEXT NOT NULL,
    "capabilityType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" REAL NOT NULL DEFAULT 0,
    "lastHealthCheckAt" DATETIME,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "changelog" TEXT NOT NULL DEFAULT '',
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL DEFAULT 'system',
    "deprecatedAt" DATETIME,
    "deprecatedBy" TEXT,
    "deprecationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CapabilityUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capabilityId" TEXT NOT NULL,
    "capabilityType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "calledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL DEFAULT 'transactional',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system'
);

-- CreateTable
CREATE TABLE "EmailSendLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sendId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "templateId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "agentId" TEXT,
    "taskId" TEXT,
    "leaseToken" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" DATETIME,
    "trialEndsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeInvoiceUrl" TEXT,
    "stripeInvoicePdf" TEXT,
    "subscriptionId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'open',
    "invoiceDate" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "planName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RewardLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "awardedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviterId" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredAt" DATETIME
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '["read"]',
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "defaultWorkspaceId" TEXT,
    "notificationSettings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IndustryPackInstallation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "installationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "packName" TEXT NOT NULL,
    "packVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'installing',
    "installedCapabilities" TEXT NOT NULL DEFAULT '[]',
    "resolvedDependencies" TEXT NOT NULL DEFAULT '[]',
    "manifest" JSONB NOT NULL,
    "installedAt" DATETIME,
    "installedBy" TEXT NOT NULL DEFAULT 'system',
    "uninstalledAt" DATETIME,
    "uninstalledBy" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Connector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "iconEmoji" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "category" TEXT NOT NULL,
    "lastSync" TEXT,
    "permissions" TEXT NOT NULL,
    "usedByAgents" TEXT NOT NULL,
    "config" JSONB,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "rateLimitUsed" INTEGER NOT NULL DEFAULT 0,
    "rateLimitResetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Connector_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Connector" ("category", "createdAt", "description", "iconEmoji", "id", "lastSync", "name", "permissions", "status", "updatedAt", "usedByAgents", "workspaceId") SELECT "category", "createdAt", "description", "iconEmoji", "id", "lastSync", "name", "permissions", "status", "updatedAt", "usedByAgents", "workspaceId" FROM "Connector";
DROP TABLE "Connector";
ALTER TABLE "new_Connector" RENAME TO "Connector";
CREATE INDEX "Connector_workspaceId_idx" ON "Connector"("workspaceId");
CREATE TABLE "new_HarnessProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "proposalType" TEXT NOT NULL DEFAULT 'eval_rule',
    "signalSnapshot" TEXT NOT NULL DEFAULT '',
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "triggeredBy" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "proposedChange" JSONB NOT NULL,
    "targetSkillId" TEXT,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "estimatedImpact" TEXT NOT NULL,
    "affectedAgents" JSONB NOT NULL DEFAULT '[]',
    "rollbackPlan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "rolledBackBy" TEXT,
    "rolledBackAt" DATETIME,
    "canaryStartedAt" DATETIME,
    "canaryWindowHours" INTEGER NOT NULL DEFAULT 24,
    "canaryMetrics" JSONB,
    "activatedAt" DATETIME,
    "canaryCompletedAt" DATETIME,
    "canaryRollbackReason" TEXT,
    "previousSnapshot" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HarnessProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_HarnessProposal" ("affectedAgents", "approvedAt", "approvedBy", "canaryCompletedAt", "canaryRollbackReason", "canaryStartedAt", "createdAt", "estimatedImpact", "evidence", "id", "previousSnapshot", "problemStatement", "proposalId", "proposedChange", "rejectedAt", "rejectedBy", "requiresHumanApproval", "reviewedAt", "reviewedBy", "rollbackPlan", "rolledBackAt", "rolledBackBy", "status", "triggerReason", "triggeredBy", "updatedAt", "workspaceId") SELECT "affectedAgents", "approvedAt", "approvedBy", "canaryCompletedAt", "canaryRollbackReason", "canaryStartedAt", "createdAt", "estimatedImpact", "evidence", "id", "previousSnapshot", "problemStatement", "proposalId", "proposedChange", "rejectedAt", "rejectedBy", "requiresHumanApproval", "reviewedAt", "reviewedBy", "rollbackPlan", "rolledBackAt", "rolledBackBy", "status", "triggerReason", "triggeredBy", "updatedAt", "workspaceId" FROM "HarnessProposal";
DROP TABLE "HarnessProposal";
ALTER TABLE "new_HarnessProposal" RENAME TO "HarnessProposal";
CREATE UNIQUE INDEX "HarnessProposal_proposalId_key" ON "HarnessProposal"("proposalId");
CREATE INDEX "HarnessProposal_workspaceId_idx" ON "HarnessProposal"("workspaceId");
CREATE INDEX "HarnessProposal_status_idx" ON "HarnessProposal"("status");
CREATE INDEX "HarnessProposal_targetSkillId_idx" ON "HarnessProposal"("targetSkillId");
CREATE INDEX "HarnessProposal_createdAt_idx" ON "HarnessProposal"("createdAt");
CREATE INDEX "HarnessProposal_canaryStartedAt_idx" ON "HarnessProposal"("canaryStartedAt");
CREATE INDEX "HarnessProposal_workspaceId_status_createdAt_idx" ON "HarnessProposal"("workspaceId", "status", "createdAt");
CREATE INDEX "HarnessProposal_workspaceId_createdAt_idx" ON "HarnessProposal"("workspaceId", "createdAt");
CREATE TABLE "new_WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL DEFAULT 'sequential',
    "triggeredBy" TEXT NOT NULL DEFAULT 'system',
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "inputContext" JSONB NOT NULL DEFAULT '{}',
    "outputContext" JSONB,
    "envelopeSnapshot" JSONB,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "agentId" TEXT,
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "input" TEXT NOT NULL DEFAULT '{}',
    "output" TEXT,
    "error" TEXT,
    "parentRunId" TEXT,
    "finishedAt" DATETIME,
    CONSTRAINT "WorkflowRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowRun" ("envelopeSnapshot", "error", "finishedAt", "id", "input", "output", "parentRunId", "startedAt", "status", "trigger", "workflowId", "workspaceId") SELECT "envelopeSnapshot", "error", "finishedAt", "id", "input", "output", "parentRunId", "startedAt", "status", "trigger", "workflowId", "workspaceId" FROM "WorkflowRun";
DROP TABLE "WorkflowRun";
ALTER TABLE "new_WorkflowRun" RENAME TO "WorkflowRun";
CREATE UNIQUE INDEX "WorkflowRun_runId_key" ON "WorkflowRun"("runId");
CREATE INDEX "WorkflowRun_workspaceId_status_createdAt_idx" ON "WorkflowRun"("workspaceId", "status", "createdAt");
CREATE INDEX "WorkflowRun_workflowId_status_idx" ON "WorkflowRun"("workflowId", "status");
CREATE INDEX "WorkflowRun_workflowId_workspaceId_createdAt_idx" ON "WorkflowRun"("workflowId", "workspaceId", "createdAt" DESC);
CREATE INDEX "WorkflowRun_workspaceId_createdAt_idx" ON "WorkflowRun"("workspaceId", "createdAt");
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "automationLevel" TEXT NOT NULL DEFAULT 'L2',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Workspace" ("createdAt", "id", "name", "plan") SELECT "createdAt", "id", "name", "plan" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
CREATE TABLE "new_WorkspaceSettings" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "defaultModel" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "taskProviderMap" TEXT NOT NULL DEFAULT '{}',
    "workflowEngine" TEXT NOT NULL DEFAULT 'local',
    "webhookUrl" TEXT,
    "evalWindowHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkspaceSettings" ("createdAt", "defaultModel", "taskProviderMap", "updatedAt", "workflowEngine", "workspaceId") SELECT "createdAt", "defaultModel", "taskProviderMap", "updatedAt", "workflowEngine", "workspaceId" FROM "WorkspaceSettings";
DROP TABLE "WorkspaceSettings";
ALTER TABLE "new_WorkspaceSettings" RENAME TO "WorkspaceSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReasoningTrace_traceId_key" ON "ReasoningTrace"("traceId");

-- CreateIndex
CREATE INDEX "ReasoningTrace_conversationId_createdAt_idx" ON "ReasoningTrace"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReasoningTrace_workspaceId_createdAt_idx" ON "ReasoningTrace"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StepRun_stepId_key" ON "StepRun"("stepId");

-- CreateIndex
CREATE INDEX "StepRun_runId_status_idx" ON "StepRun"("runId", "status");

-- CreateIndex
CREATE INDEX "StepRun_workspaceId_nodeType_idx" ON "StepRun"("workspaceId", "nodeType");

-- CreateIndex
CREATE INDEX "StepRun_workspaceId_status_createdAt_idx" ON "StepRun"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StepRun_workspaceId_createdAt_idx" ON "StepRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrchestrationSession_sessionId_key" ON "OrchestrationSession"("sessionId");

-- CreateIndex
CREATE INDEX "OrchestrationSession_workspaceId_status_idx" ON "OrchestrationSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OrchestrationSession_workflowRunId_idx" ON "OrchestrationSession"("workflowRunId");

-- CreateIndex
CREATE UNIQUE INDEX "SubAgentTask_taskId_key" ON "SubAgentTask"("taskId");

-- CreateIndex
CREATE INDEX "SubAgentTask_sessionId_status_idx" ON "SubAgentTask"("sessionId", "status");

-- CreateIndex
CREATE INDEX "SubAgentTask_agentId_status_idx" ON "SubAgentTask"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_messageId_key" ON "AgentMessage"("messageId");

-- CreateIndex
CREATE INDEX "AgentMessage_sessionId_messageType_idx" ON "AgentMessage"("sessionId", "messageType");

-- CreateIndex
CREATE INDEX "AgentMessage_taskId_idx" ON "AgentMessage"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalCheckpoint_checkpointId_key" ON "ApprovalCheckpoint"("checkpointId");

-- CreateIndex
CREATE INDEX "ApprovalCheckpoint_workspaceId_decision_idx" ON "ApprovalCheckpoint"("workspaceId", "decision");

-- CreateIndex
CREATE INDEX "ApprovalCheckpoint_proposalId_idx" ON "ApprovalCheckpoint"("proposalId");

-- CreateIndex
CREATE INDEX "ApprovalCheckpoint_taskId_idx" ON "ApprovalCheckpoint"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "HarnessSnapshot_snapshotId_key" ON "HarnessSnapshot"("snapshotId");

-- CreateIndex
CREATE INDEX "HarnessSnapshot_workspaceId_agentId_status_idx" ON "HarnessSnapshot"("workspaceId", "agentId", "status");

-- CreateIndex
CREATE INDEX "HarnessSnapshot_proposalId_idx" ON "HarnessSnapshot"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "HarnessCanary_canaryId_key" ON "HarnessCanary"("canaryId");

-- CreateIndex
CREATE UNIQUE INDEX "HarnessCanary_proposalId_key" ON "HarnessCanary"("proposalId");

-- CreateIndex
CREATE INDEX "HarnessCanary_workspaceId_status_idx" ON "HarnessCanary"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HarnessCanary_agentId_status_idx" ON "HarnessCanary"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HarnessRollback_rollbackId_key" ON "HarnessRollback"("rollbackId");

-- CreateIndex
CREATE INDEX "HarnessRollback_workspaceId_status_idx" ON "HarnessRollback"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HarnessRollback_canaryId_idx" ON "HarnessRollback"("canaryId");

-- CreateIndex
CREATE INDEX "HarnessRollback_agentId_idx" ON "HarnessRollback"("agentId");

-- CreateIndex
CREATE INDEX "CapabilityVersion_workspaceId_capabilityType_status_idx" ON "CapabilityVersion"("workspaceId", "capabilityType", "status");

-- CreateIndex
CREATE INDEX "CapabilityVersion_capabilityId_status_idx" ON "CapabilityVersion"("capabilityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityVersion_capabilityId_version_key" ON "CapabilityVersion"("capabilityId", "version");

-- CreateIndex
CREATE INDEX "CapabilityUsageLog_capabilityId_calledAt_idx" ON "CapabilityUsageLog"("capabilityId", "calledAt");

-- CreateIndex
CREATE INDEX "CapabilityUsageLog_workspaceId_calledAt_idx" ON "CapabilityUsageLog"("workspaceId", "calledAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_templateId_key" ON "EmailTemplate"("templateId");

-- CreateIndex
CREATE INDEX "EmailTemplate_workspaceId_category_status_idx" ON "EmailTemplate"("workspaceId", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendLog_sendId_key" ON "EmailSendLog"("sendId");

-- CreateIndex
CREATE INDEX "EmailSendLog_workspaceId_status_createdAt_idx" ON "EmailSendLog"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailSendLog_connectorId_createdAt_idx" ON "EmailSendLog"("connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_workspaceId_type_idx" ON "CreditLedger"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "RewardLedger_userId_idx" ON "RewardLedger"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardLedger_userId_taskId_key" ON "RewardLedger"("userId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_inviteCode_key" ON "Invite"("inviteCode");

-- CreateIndex
CREATE INDEX "Invite_inviterId_createdAt_idx" ON "Invite"("inviterId", "createdAt");

-- CreateIndex
CREATE INDEX "Secret_userId_idx" ON "Secret"("userId");

-- CreateIndex
CREATE INDEX "Secret_workspaceId_idx" ON "Secret"("workspaceId");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryPackInstallation_installationId_key" ON "IndustryPackInstallation"("installationId");

-- CreateIndex
CREATE INDEX "IndustryPackInstallation_workspaceId_status_idx" ON "IndustryPackInstallation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "IndustryPackInstallation_packId_idx" ON "IndustryPackInstallation"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryPackInstallation_workspaceId_packId_packVersion_key" ON "IndustryPackInstallation"("workspaceId", "packId", "packVersion");

-- CreateIndex
CREATE INDEX "Agent_industryId_idx" ON "Agent"("industryId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_action_createdAt_idx" ON "AuditLog"("workspaceId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_workspaceId_createdAt_idx" ON "Inquiry"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_workspaceId_priority_idx" ON "Inquiry"("workspaceId", "priority");

-- CreateIndex
CREATE INDEX "MarketIntelligence_workspaceId_publishedAt_idx" ON "MarketIntelligence"("workspaceId", "publishedAt");

-- CreateIndex
CREATE INDEX "Project_workspaceId_createdAt_idx" ON "Project"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Workflow_industryId_idx" ON "Workflow"("industryId");
