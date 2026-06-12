-- Migration: WorkspaceSettings（策略路由 / 模型路由配置）
-- 新增每个 Workspace 的默认模型与各 taskType Provider 偏好配置表

CREATE TABLE "WorkspaceSettings" (
    "workspaceId"     TEXT NOT NULL PRIMARY KEY,
    "defaultModel"    TEXT NOT NULL DEFAULT 'deepseek-chat',
    "taskProviderMap" TEXT NOT NULL DEFAULT '{}',
    "updatedAt"       DATETIME NOT NULL,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
