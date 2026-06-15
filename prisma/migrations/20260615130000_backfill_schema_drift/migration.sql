-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "industryId" TEXT;
ALTER TABLE "Agent" ADD COLUMN "templateId" TEXT;

-- AlterTable
ALTER TABLE "MemoryRevision" ADD COLUMN "proposalId" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN "industryId" TEXT;
ALTER TABLE "Workflow" ADD COLUMN "templateId" TEXT;

-- CreateTable
CREATE TABLE "HarnessBundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" TEXT NOT NULL,
    "previousVersion" TEXT,
    "agentPolicies" JSONB,
    "workflowTemplates" JSONB,
    "skillBindings" JSONB,
    "contextPolicy" JSONB,
    "memoryPolicy" JSONB,
    "connectorPolicies" JSONB,
    "guardrailPolicy" JSONB,
    "evalRuleSet" JSONB,
    "industryBinding" JSONB,
    "canaryPercent" INTEGER NOT NULL DEFAULT 0,
    "canaryStartedAt" DATETIME,
    "canaryEndsAt" DATETIME,
    "currentSnapshotId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "activatedAt" DATETIME,
    "deprecatedAt" DATETIME,
    CONSTRAINT "HarnessBundle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HarnessBundleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HarnessBundleSnapshot_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "HarnessBundle" ("bundleId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HarnessProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'default',
    "triggeredBy" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT [],
    "proposedChange" JSONB NOT NULL,
    "targetSkillId" TEXT,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "estimatedImpact" TEXT NOT NULL,
    "affectedAgents" JSONB NOT NULL DEFAULT [],
    "rollbackPlan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "previousSnapshot" TEXT,
    "bundleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HarnessProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HarnessProposal_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "HarnessBundle" ("bundleId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HarnessProposal" ("affectedAgents", "createdAt", "estimatedImpact", "evidence", "id", "previousSnapshot", "problemStatement", "proposalId", "proposedChange", "requiresHumanApproval", "reviewedAt", "reviewedBy", "rollbackPlan", "status", "triggerReason", "triggeredBy", "updatedAt", "workspaceId") SELECT "affectedAgents", "createdAt", "estimatedImpact", "evidence", "id", "previousSnapshot", "problemStatement", "proposalId", "proposedChange", "requiresHumanApproval", "reviewedAt", "reviewedBy", "rollbackPlan", "status", "triggerReason", "triggeredBy", "updatedAt", "workspaceId" FROM "HarnessProposal";
DROP TABLE "HarnessProposal";
ALTER TABLE "new_HarnessProposal" RENAME TO "HarnessProposal";
CREATE UNIQUE INDEX "HarnessProposal_proposalId_key" ON "HarnessProposal"("proposalId");
CREATE INDEX "HarnessProposal_workspaceId_idx" ON "HarnessProposal"("workspaceId");
CREATE INDEX "HarnessProposal_status_idx" ON "HarnessProposal"("status");
CREATE INDEX "HarnessProposal_targetSkillId_idx" ON "HarnessProposal"("targetSkillId");
CREATE INDEX "HarnessProposal_createdAt_idx" ON "HarnessProposal"("createdAt");
CREATE INDEX "HarnessProposal_bundleId_idx" ON "HarnessProposal"("bundleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "HarnessBundle_bundleId_key" ON "HarnessBundle"("bundleId");

-- CreateIndex
CREATE INDEX "HarnessBundle_workspaceId_idx" ON "HarnessBundle"("workspaceId");

-- CreateIndex
CREATE INDEX "HarnessBundle_status_idx" ON "HarnessBundle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HarnessBundleSnapshot_snapshotId_key" ON "HarnessBundleSnapshot"("snapshotId");

-- CreateIndex
CREATE INDEX "HarnessBundleSnapshot_bundleId_idx" ON "HarnessBundleSnapshot"("bundleId");

-- CreateIndex
CREATE INDEX "HarnessBundleSnapshot_createdAt_idx" ON "HarnessBundleSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "Agent_industryId_idx" ON "Agent"("industryId");

-- CreateIndex
CREATE INDEX "Workflow_industryId_idx" ON "Workflow"("industryId");

