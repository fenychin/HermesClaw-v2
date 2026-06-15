-- AGENTS.md §4.7 / §5.2 / §6.2：自动化授权等级三级粒度配置
-- CLAUDE.md §3.2：契约层枚举单源在 @hermesclaw/event-contracts，应用层 zod safeParse 校验
-- SQLite 无原生 enum，automationLevel / riskLevel 用 TEXT 列承载

CREATE TABLE "AutomationPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "actionType" TEXT,
    "automationLevel" TEXT NOT NULL DEFAULT 'L1',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "requireApproverIds" TEXT NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationPolicy_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- SQLite 把 NULL 视为 distinct：(ws, null, null) / (ws, agent, null) / (ws, agent, action) 可共存
CREATE UNIQUE INDEX "AutomationPolicy_workspaceId_agentId_actionType_key"
    ON "AutomationPolicy"("workspaceId", "agentId", "actionType");
CREATE INDEX "AutomationPolicy_workspaceId_idx"
    ON "AutomationPolicy"("workspaceId");
CREATE INDEX "AutomationPolicy_agentId_idx"
    ON "AutomationPolicy"("agentId");
