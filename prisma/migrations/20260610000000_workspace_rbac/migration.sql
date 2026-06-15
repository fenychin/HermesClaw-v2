-- Migration: 多租户 Workspace + RBAC
-- 新增 Workspace / WorkspaceMember 模型 + 所有业务表新增 workspaceId

-- 1. 创建 Workspace 表
CREATE TABLE "Workspace" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "plan"      TEXT NOT NULL DEFAULT 'free',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建 WorkspaceMember 表（复合主键）
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "role"        TEXT NOT NULL DEFAULT 'MEMBER',
    PRIMARY KEY ("workspaceId", "userId"),
    CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
    CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- 3. 插入默认 Workspace
INSERT INTO "Workspace" ("id", "name", "plan") VALUES ('default', '默认工作空间', 'free');

-- 4. 将所有现有用户加入默认 Workspace 为 OWNER
INSERT INTO "WorkspaceMember" ("workspaceId", "userId", "role")
SELECT 'default', "id", 'OWNER' FROM "User";

-- 5. 为所有业务表新增 workspaceId 列（SQLite 不支持 ADD COLUMN 带默认值 + FK，分两步）
-- Agent
ALTER TABLE "Agent" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Agent_workspaceId_idx" ON "Agent"("workspaceId");

-- AgentLog
ALTER TABLE "AgentLog" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "AgentLog_workspaceId_idx" ON "AgentLog"("workspaceId");

-- Project
ALTER TABLE "Project" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- Memory
ALTER TABLE "Memory" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Memory_workspaceId_idx" ON "Memory"("workspaceId");

-- MemoryRevision
ALTER TABLE "MemoryRevision" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "MemoryRevision_workspaceId_idx" ON "MemoryRevision"("workspaceId");

-- Connector
ALTER TABLE "Connector" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Connector_workspaceId_idx" ON "Connector"("workspaceId");

-- Skill
ALTER TABLE "Skill" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Skill_workspaceId_idx" ON "Skill"("workspaceId");

-- HarnessProposal
ALTER TABLE "HarnessProposal" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "HarnessProposal_workspaceId_idx" ON "HarnessProposal"("workspaceId");

-- Conversation
ALTER TABLE "Conversation" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Conversation_workspaceId_idx" ON "Conversation"("workspaceId");

-- ConversationMessage
ALTER TABLE "ConversationMessage" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "ConversationMessage_workspaceId_idx" ON "ConversationMessage"("workspaceId");

-- AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "AuditLog_workspaceId_idx" ON "AuditLog"("workspaceId");

-- Inquiry
ALTER TABLE "Inquiry" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Inquiry_workspaceId_idx" ON "Inquiry"("workspaceId");

-- MarketIntelligence
ALTER TABLE "MarketIntelligence" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "MarketIntelligence_workspaceId_idx" ON "MarketIntelligence"("workspaceId");

-- Quotation
ALTER TABLE "Quotation" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Quotation_workspaceId_idx" ON "Quotation"("workspaceId");

-- EvolutionLog
ALTER TABLE "EvolutionLog" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "EvolutionLog_workspaceId_idx" ON "EvolutionLog"("workspaceId");

-- ToolRegistry
ALTER TABLE "ToolRegistry" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "ToolRegistry_workspaceId_idx" ON "ToolRegistry"("workspaceId");

-- ToolGrant
ALTER TABLE "ToolGrant" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "ToolGrant_workspaceId_idx" ON "ToolGrant"("workspaceId");

-- Workflow
ALTER TABLE "Workflow" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "Workflow_workspaceId_idx" ON "Workflow"("workspaceId");

-- WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "WorkflowRun_workspaceId_idx" ON "WorkflowRun"("workspaceId");

-- WorkflowNodeRun
ALTER TABLE "WorkflowNodeRun" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "WorkflowNodeRun_workspaceId_idx" ON "WorkflowNodeRun"("workspaceId");
