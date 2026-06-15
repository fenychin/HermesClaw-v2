-- AGENTS.md §3.4：所有写操作必须具备幂等保护
-- CLAUDE.md §8.2：ExecutionEvent 入库（Receipt Store 一部分）以便审计回放

-- IdempotencyKey：(workspaceId, key) 全局唯一，命中返回缓存的 taskId
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_key_key" ON "IdempotencyKey"("workspaceId", "key");
CREATE INDEX "IdempotencyKey_key_idx" ON "IdempotencyKey"("key");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- ExecutionEventLog：OpenClaw → Hermes 回流的事件原文
-- eventId 全局唯一以实现幂等去重
CREATE TABLE "ExecutionEventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "connectorId" TEXT,
    "deviceId" TEXT,
    "receiptHash" TEXT,
    "parentWorkflowRunId" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "timestamp" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ExecutionEventLog_eventId_key" ON "ExecutionEventLog"("eventId");
CREATE INDEX "ExecutionEventLog_taskId_idx" ON "ExecutionEventLog"("taskId");
CREATE INDEX "ExecutionEventLog_workflowRunId_idx" ON "ExecutionEventLog"("workflowRunId");
CREATE INDEX "ExecutionEventLog_eventType_idx" ON "ExecutionEventLog"("eventType");
CREATE INDEX "ExecutionEventLog_receivedAt_idx" ON "ExecutionEventLog"("receivedAt");
