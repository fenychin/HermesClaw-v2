-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkspaceSettings" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "defaultModel" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "taskProviderMap" TEXT NOT NULL DEFAULT '{}',
    "workflowEngine" TEXT NOT NULL DEFAULT 'local',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkspaceSettings" ("createdAt", "defaultModel", "taskProviderMap", "updatedAt", "workspaceId") SELECT "createdAt", "defaultModel", "taskProviderMap", "updatedAt", "workspaceId" FROM "WorkspaceSettings";
DROP TABLE "WorkspaceSettings";
ALTER TABLE "new_WorkspaceSettings" RENAME TO "WorkspaceSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
