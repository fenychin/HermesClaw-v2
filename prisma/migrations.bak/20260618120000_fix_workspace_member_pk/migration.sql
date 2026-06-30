-- TD-2026-06-17-002: WorkspaceMember 主键模型修复
-- 旧主键 @@id([workspaceId, userId]) 与前端期望的 member.id 不一致；
-- 业务层用 `${workspaceId}:${userId}` 字符串拼接绕过，且 createdAt 强制为 null。
--
-- 本迁移：
--   1. 引入 id 列（cuid，PK）
--   2. 引入 createdAt 列（默认 now()）
--   3. 复合唯一约束保留为 @@unique([workspaceId, userId])，等价旧主键的语义
--   4. 补 (workspaceId) / (userId) 单列索引，承接 listMembers / 查找用户加入工作空间的查询
--
-- SQLite 没有 ALTER TABLE 修改主键能力——使用「新表 + 数据回填 + 替换」的标准重建模式。

PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;

CREATE TABLE "new_WorkspaceMember" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "role"        TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMember_userId_fkey"      FOREIGN KEY ("userId")      REFERENCES "User"      ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 旧表无 id / createdAt：id 用 lower(hex(randomblob(12))) 生成 24 字符近似 cuid 形态，
-- createdAt 落到迁移时刻（CURRENT_TIMESTAMP，由 DEFAULT 自动填）。
INSERT INTO "new_WorkspaceMember" ("id", "workspaceId", "userId", "role")
SELECT lower(hex(randomblob(12))), "workspaceId", "userId", "role"
FROM "WorkspaceMember";

DROP TABLE "WorkspaceMember";
ALTER TABLE "new_WorkspaceMember" RENAME TO "WorkspaceMember";

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX        "WorkspaceMember_workspaceId_idx"        ON "WorkspaceMember"("workspaceId");
CREATE INDEX        "WorkspaceMember_userId_idx"             ON "WorkspaceMember"("userId");

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = OFF;
