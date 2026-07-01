-- AlterTable
ALTER TABLE "AgentLog" ADD COLUMN "workflowRunId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "workflowRunId" TEXT;

-- CreateTable
CREATE TABLE "FileRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'archive',
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "parseStatus" TEXT NOT NULL DEFAULT 'unparsed',
    "vectorIndexStatus" TEXT NOT NULL DEFAULT 'unindexed',
    "parseSummary" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "relatedProjectId" TEXT,
    "versions" TEXT NOT NULL DEFAULT '[]',
    "operatedBy" TEXT NOT NULL DEFAULT '',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FileRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoryAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "memoryId" TEXT,
    "query" TEXT NOT NULL,
    "hit" BOOLEAN NOT NULL,
    "recalledCount" INTEGER NOT NULL DEFAULT 0,
    "sourceTaskId" TEXT,
    "sourceStep" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryAccessLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemoryAccessLog_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeGap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "affectedWorkflows" TEXT,
    "suggestedSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "filledByTaskId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeGap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "agentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkillBinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillBinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillBinding_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptId" TEXT NOT NULL,
    "receiptHash" TEXT,
    "taskId" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "executedAt" DATETIME NOT NULL,
    "response" JSONB,
    "errorCode" TEXT,
    "failureReason" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "compensationStrategy" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "workspaceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExecutionSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "finalStatus" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "receiptHashes" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConnectorLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leaseId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "connectorId" TEXT NOT NULL,
    "taskId" TEXT,
    "runtimeId" TEXT NOT NULL DEFAULT 'openclaw-runtime',
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '[]',
    "maxRiskLevel" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentMemoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patchId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourceTaskId" TEXT NOT NULL,
    "patchLayer" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "confidence" REAL NOT NULL,
    "ttl" INTEGER NOT NULL,
    "writtenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditTraceId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AgentTaskEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "executedAt" DATETIME NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "kpiSnapshot" JSONB NOT NULL,
    "baselineSnapshot" JSONB NOT NULL,
    "outcomeLabel" TEXT NOT NULL,
    "failureReason" TEXT,
    "memoryPatchSuggestion" JSONB NOT NULL,
    "humanFeedback" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    "source" TEXT NOT NULL DEFAULT 'custom',
    "version" TEXT,
    "health" TEXT,
    "lastSync" TEXT,
    "permissions" TEXT NOT NULL,
    "usedByAgents" TEXT NOT NULL,
    "config" JSONB,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "rateLimitUsed" INTEGER NOT NULL DEFAULT 0,
    "rateLimitResetAt" DATETIME,
    "packId" TEXT,
    "requiredAutomationLevel" TEXT NOT NULL DEFAULT 'L1',
    "lastHeartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Connector_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Connector" ("category", "config", "createdAt", "description", "iconEmoji", "id", "lastSync", "name", "permissions", "rateLimit", "rateLimitResetAt", "rateLimitUsed", "status", "updatedAt", "usedByAgents", "workspaceId") SELECT "category", "config", "createdAt", "description", "iconEmoji", "id", "lastSync", "name", "permissions", "rateLimit", "rateLimitResetAt", "rateLimitUsed", "status", "updatedAt", "usedByAgents", "workspaceId" FROM "Connector";
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
    "triggeredBy" TEXT,
    "triggerReason" TEXT,
    "problemStatement" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "proposedChange" JSONB,
    "targetSkillId" TEXT,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "estimatedImpact" TEXT NOT NULL,
    "affectedAgents" JSONB NOT NULL DEFAULT '[]',
    "rollbackPlan" TEXT,
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
    "agentId" TEXT,
    "triggerData" JSONB,
    "currentHarnessVersion" TEXT,
    "proposedChanges" JSONB,
    "reasoning" TEXT,
    "riskAssessment" TEXT,
    "approvalStatus" TEXT DEFAULT 'pending',
    "rejectionReason" TEXT,
    "newHarnessVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HarnessProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_HarnessProposal" ("activatedAt", "affectedAgents", "approvedAt", "approvedBy", "canaryCompletedAt", "canaryMetrics", "canaryRollbackReason", "canaryStartedAt", "canaryWindowHours", "createdAt", "estimatedImpact", "evidence", "id", "previousSnapshot", "problemStatement", "proposalId", "proposalType", "proposedChange", "rejectedAt", "rejectedBy", "requiresHumanApproval", "reviewedAt", "reviewedBy", "rollbackPlan", "rolledBackAt", "rolledBackBy", "severity", "signalSnapshot", "status", "targetSkillId", "title", "triggerReason", "triggeredBy", "updatedAt", "workspaceId") SELECT "activatedAt", "affectedAgents", "approvedAt", "approvedBy", "canaryCompletedAt", "canaryMetrics", "canaryRollbackReason", "canaryStartedAt", "canaryWindowHours", "createdAt", "estimatedImpact", "evidence", "id", "previousSnapshot", "problemStatement", "proposalId", "proposalType", "proposedChange", "rejectedAt", "rejectedBy", "requiresHumanApproval", "reviewedAt", "reviewedBy", "rollbackPlan", "rolledBackAt", "rolledBackBy", "severity", "signalSnapshot", "status", "targetSkillId", "title", "triggerReason", "triggeredBy", "updatedAt", "workspaceId" FROM "HarnessProposal";
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
CREATE INDEX "HarnessProposal_agentId_approvalStatus_idx" ON "HarnessProposal"("agentId", "approvalStatus");
CREATE TABLE "new_Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "relatedProject" TEXT,
    "relatedAgent" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.8,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "projectId" TEXT,
    "taskId" TEXT,
    "workflowRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Memory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Memory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Memory_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun" ("runId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Memory" ("confidence", "content", "createdAt", "frozen", "id", "projectId", "relatedAgent", "relatedProject", "source", "status", "summary", "tags", "type", "updatedAt", "version", "workspaceId") SELECT "confidence", "content", "createdAt", "frozen", "id", "projectId", "relatedAgent", "relatedProject", "source", "status", "summary", "tags", "type", "updatedAt", "version", "workspaceId" FROM "Memory";
DROP TABLE "Memory";
ALTER TABLE "new_Memory" RENAME TO "Memory";
CREATE INDEX "Memory_workspaceId_idx" ON "Memory"("workspaceId");
CREATE INDEX "Memory_workspaceId_status_idx" ON "Memory"("workspaceId", "status");
CREATE INDEX "Memory_type_idx" ON "Memory"("type");
CREATE INDEX "Memory_frozen_idx" ON "Memory"("frozen");
CREATE INDEX "Memory_projectId_idx" ON "Memory"("projectId");
CREATE INDEX "Memory_taskId_idx" ON "Memory"("taskId");
CREATE INDEX "Memory_workflowRunId_idx" ON "Memory"("workflowRunId");
CREATE TABLE "new_OrchestrationSession" (
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
INSERT INTO "new_OrchestrationSession" ("completedAt", "createdAt", "createdBy", "failedAt", "failureReason", "goal", "humanInterventionReason", "id", "inputContext", "mergedOutput", "mode", "orchestratorAgentId", "sessionId", "startedAt", "status", "subAgentIds", "updatedAt", "workflowRunId", "workspaceId") SELECT "completedAt", "createdAt", "createdBy", "failedAt", "failureReason", "goal", "humanInterventionReason", "id", "inputContext", "mergedOutput", "mode", "orchestratorAgentId", "sessionId", "startedAt", "status", "subAgentIds", "updatedAt", "workflowRunId", "workspaceId" FROM "OrchestrationSession";
DROP TABLE "OrchestrationSession";
ALTER TABLE "new_OrchestrationSession" RENAME TO "OrchestrationSession";
CREATE UNIQUE INDEX "OrchestrationSession_sessionId_key" ON "OrchestrationSession"("sessionId");
CREATE INDEX "OrchestrationSession_workspaceId_status_idx" ON "OrchestrationSession"("workspaceId", "status");
CREATE INDEX "OrchestrationSession_workflowRunId_idx" ON "OrchestrationSession"("workflowRunId");
CREATE TABLE "new_Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1.0.0',
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CUSTOM',
    "status" TEXT NOT NULL DEFAULT 'active',
    "inputSchema" TEXT NOT NULL,
    "outputSchema" TEXT NOT NULL,
    "usedByAgents" TEXT NOT NULL,
    "scenarios" TEXT NOT NULL,
    "skillMdContent" TEXT,
    "zipPath" TEXT,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "automationLevel" TEXT NOT NULL DEFAULT 'L2',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Skill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Skill" ("automationLevel", "category", "createdAt", "description", "id", "inputSchema", "name", "outputSchema", "scenarios", "source", "status", "updatedAt", "usedByAgents", "version", "workspaceId") SELECT "automationLevel", "category", "createdAt", "description", "id", "inputSchema", "name", "outputSchema", "scenarios", "source", "status", "updatedAt", "usedByAgents", "version", "workspaceId" FROM "Skill";
DROP TABLE "Skill";
ALTER TABLE "new_Skill" RENAME TO "Skill";
CREATE INDEX "Skill_workspaceId_idx" ON "Skill"("workspaceId");
CREATE INDEX "Skill_source_idx" ON "Skill"("source");
CREATE UNIQUE INDEX "Skill_workspaceId_name_key" ON "Skill"("workspaceId", "name");
CREATE TABLE "new_StepRun" (
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
INSERT INTO "new_StepRun" ("agentId", "capabilityId", "childStepIds", "completedAt", "createdAt", "durationMs", "errorCode", "errorMessage", "id", "inputData", "nodeId", "nodeType", "outputData", "parentStepId", "retryCount", "runId", "startedAt", "status", "stepId", "updatedAt", "workspaceId") SELECT "agentId", "capabilityId", "childStepIds", "completedAt", "createdAt", "durationMs", "errorCode", "errorMessage", "id", "inputData", "nodeId", "nodeType", "outputData", "parentStepId", "retryCount", "runId", "startedAt", "status", "stepId", "updatedAt", "workspaceId" FROM "StepRun";
DROP TABLE "StepRun";
ALTER TABLE "new_StepRun" RENAME TO "StepRun";
CREATE UNIQUE INDEX "StepRun_stepId_key" ON "StepRun"("stepId");
CREATE INDEX "StepRun_runId_status_idx" ON "StepRun"("runId", "status");
CREATE INDEX "StepRun_workspaceId_nodeType_idx" ON "StepRun"("workspaceId", "nodeType");
CREATE INDEX "StepRun_workspaceId_status_createdAt_idx" ON "StepRun"("workspaceId", "status", "createdAt");
CREATE INDEX "StepRun_workspaceId_createdAt_idx" ON "StepRun"("workspaceId", "createdAt");
CREATE INDEX "StepRun_status_startedAt_idx" ON "StepRun"("status", "startedAt");
CREATE TABLE "new_SubAgentTask" (
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
INSERT INTO "new_SubAgentTask" ("agentId", "completedAt", "createdAt", "errorCode", "errorMessage", "id", "inputData", "instruction", "maxRetries", "output", "priority", "retryCount", "sessionId", "startedAt", "status", "taskId", "timeoutMs", "updatedAt", "workspaceId") SELECT "agentId", "completedAt", "createdAt", "errorCode", "errorMessage", "id", "inputData", "instruction", "maxRetries", "output", "priority", "retryCount", "sessionId", "startedAt", "status", "taskId", "timeoutMs", "updatedAt", "workspaceId" FROM "SubAgentTask";
DROP TABLE "SubAgentTask";
ALTER TABLE "new_SubAgentTask" RENAME TO "SubAgentTask";
CREATE UNIQUE INDEX "SubAgentTask_taskId_key" ON "SubAgentTask"("taskId");
CREATE INDEX "SubAgentTask_sessionId_status_idx" ON "SubAgentTask"("sessionId", "status");
CREATE INDEX "SubAgentTask_agentId_status_idx" ON "SubAgentTask"("agentId", "status");
CREATE TABLE "new_UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "defaultWorkspaceId" TEXT,
    "notificationSettings" TEXT NOT NULL DEFAULT '{}',
    "quickActionOrder" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserPreference" ("createdAt", "defaultWorkspaceId", "id", "language", "notificationSettings", "theme", "updatedAt", "userId") SELECT "createdAt", "defaultWorkspaceId", "id", "language", "notificationSettings", "theme", "updatedAt", "userId" FROM "UserPreference";
DROP TABLE "UserPreference";
ALTER TABLE "new_UserPreference" RENAME TO "UserPreference";
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");
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
INSERT INTO "new_WorkflowRun" ("agentId", "completedAt", "createdAt", "durationMs", "envelopeSnapshot", "error", "errorMessage", "finishedAt", "id", "input", "inputContext", "mode", "output", "outputContext", "parentRunId", "runId", "sessionId", "startedAt", "status", "trigger", "triggerType", "triggeredBy", "updatedAt", "workflowId", "workflowVersion", "workspaceId") SELECT "agentId", "completedAt", "createdAt", "durationMs", "envelopeSnapshot", "error", "errorMessage", "finishedAt", "id", "input", "inputContext", "mode", "output", "outputContext", "parentRunId", "runId", "sessionId", "startedAt", "status", "trigger", "triggerType", "triggeredBy", "updatedAt", "workflowId", "workflowVersion", "workspaceId" FROM "WorkflowRun";
DROP TABLE "WorkflowRun";
ALTER TABLE "new_WorkflowRun" RENAME TO "WorkflowRun";
CREATE UNIQUE INDEX "WorkflowRun_runId_key" ON "WorkflowRun"("runId");
CREATE INDEX "WorkflowRun_workspaceId_status_createdAt_idx" ON "WorkflowRun"("workspaceId", "status", "createdAt");
CREATE INDEX "WorkflowRun_workflowId_status_idx" ON "WorkflowRun"("workflowId", "status");
CREATE INDEX "WorkflowRun_workflowId_workspaceId_createdAt_idx" ON "WorkflowRun"("workflowId", "workspaceId", "createdAt" DESC);
CREATE INDEX "WorkflowRun_workspaceId_createdAt_idx" ON "WorkflowRun"("workspaceId", "createdAt");
CREATE INDEX "WorkflowRun_workspaceId_startedAt_idx" ON "WorkflowRun"("workspaceId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FileRecord_workspaceId_idx" ON "FileRecord"("workspaceId");

-- CreateIndex
CREATE INDEX "FileRecord_workspaceId_category_idx" ON "FileRecord"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "FileRecord_workspaceId_parseStatus_idx" ON "FileRecord"("workspaceId", "parseStatus");

-- CreateIndex
CREATE INDEX "FileRecord_workspaceId_createdAt_idx" ON "FileRecord"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FileRecord_deletedAt_idx" ON "FileRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_workspaceId_idx" ON "MemoryAccessLog"("workspaceId");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_workspaceId_hit_idx" ON "MemoryAccessLog"("workspaceId", "hit");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_memoryId_idx" ON "MemoryAccessLog"("memoryId");

-- CreateIndex
CREATE INDEX "MemoryAccessLog_createdAt_idx" ON "MemoryAccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeGap_workspaceId_idx" ON "KnowledgeGap"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeGap_workspaceId_status_idx" ON "KnowledgeGap"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeGap_type_idx" ON "KnowledgeGap"("type");

-- CreateIndex
CREATE INDEX "KnowledgeGap_priority_idx" ON "KnowledgeGap"("priority");

-- CreateIndex
CREATE INDEX "SkillBinding_workspaceId_idx" ON "SkillBinding"("workspaceId");

-- CreateIndex
CREATE INDEX "SkillBinding_agentId_idx" ON "SkillBinding"("agentId");

-- CreateIndex
CREATE INDEX "SkillBinding_skillId_idx" ON "SkillBinding"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillBinding_agentId_skillId_key" ON "SkillBinding"("agentId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionReceipt_receiptId_key" ON "ActionReceipt"("receiptId");

-- CreateIndex
CREATE INDEX "ActionReceipt_workspaceId_taskId_idx" ON "ActionReceipt"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "ActionReceipt_workspaceId_workflowRunId_idx" ON "ActionReceipt"("workspaceId", "workflowRunId");

-- CreateIndex
CREATE INDEX "ActionReceipt_workspaceId_connectorId_createdAt_idx" ON "ActionReceipt"("workspaceId", "connectorId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionReceipt_idempotencyKey_idx" ON "ActionReceipt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionSummary_summaryId_key" ON "ExecutionSummary"("summaryId");

-- CreateIndex
CREATE INDEX "ExecutionSummary_workspaceId_taskId_idx" ON "ExecutionSummary"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "ExecutionSummary_workspaceId_workflowRunId_idx" ON "ExecutionSummary"("workspaceId", "workflowRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorLease_leaseId_key" ON "ConnectorLease"("leaseId");

-- CreateIndex
CREATE INDEX "ConnectorLease_workspaceId_connectorId_idx" ON "ConnectorLease"("workspaceId", "connectorId");

-- CreateIndex
CREATE INDEX "ConnectorLease_workspaceId_taskId_idx" ON "ConnectorLease"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "ConnectorLease_status_idx" ON "ConnectorLease"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemoryEntry_patchId_key" ON "AgentMemoryEntry"("patchId");

-- CreateIndex
CREATE INDEX "AgentMemoryEntry_agentId_patchLayer_idx" ON "AgentMemoryEntry"("agentId", "patchLayer");

-- CreateIndex
CREATE INDEX "AgentMemoryEntry_auditTraceId_idx" ON "AgentMemoryEntry"("auditTraceId");

-- CreateIndex
CREATE INDEX "AgentTaskEvaluation_agentId_executedAt_idx" ON "AgentTaskEvaluation"("agentId", "executedAt");

-- CreateIndex
CREATE INDEX "AgentTaskEvaluation_workflowRunId_idx" ON "AgentTaskEvaluation"("workflowRunId");

-- CreateIndex
CREATE INDEX "AgentLog_workspaceId_agentId_createdAt_idx" ON "AgentLog"("workspaceId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_workflowRunId_idx" ON "AgentLog"("workflowRunId");

-- CreateIndex
CREATE INDEX "AuditLog_workflowRunId_idx" ON "AuditLog"("workflowRunId");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_updatedAt_idx" ON "Conversation"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Inquiry_workspaceId_replied_receivedAt_idx" ON "Inquiry"("workspaceId", "replied", "receivedAt");

-- CreateIndex
CREATE INDEX "MemoryRevision_memoryId_idx" ON "MemoryRevision"("memoryId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_status_idx" ON "Project"("workspaceId", "status");
