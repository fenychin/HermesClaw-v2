-- This migration adds the Artifact model for file center artifact tracking
-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'document',
    "sourceType" TEXT NOT NULL DEFAULT 'artifact',
    "taskId" TEXT,
    "workflowRunId" TEXT,
    "receiptHash" TEXT,
    "connectorId" TEXT,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "parseSummary" TEXT,
    "operatedBy" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Artifact_workspaceId_createdAt_idx" ON "Artifact"("workspaceId", "createdAt" DESC);
CREATE INDEX "Artifact_taskId_idx" ON "Artifact"("taskId");
CREATE INDEX "Artifact_workflowRunId_idx" ON "Artifact"("workflowRunId");
CREATE INDEX "Artifact_receiptHash_idx" ON "Artifact"("receiptHash");
