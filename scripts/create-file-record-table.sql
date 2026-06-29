-- FileRecord 表建表脚本（SQLite 本地开发用）
-- 运行方式：node scripts/create-file-record-table.js
-- 或直接通过 DB Browser for SQLite 执行

CREATE TABLE IF NOT EXISTS "FileRecord" (
  "id"                TEXT    NOT NULL PRIMARY KEY,
  "workspaceId"       TEXT    NOT NULL,
  "name"              TEXT    NOT NULL,
  "type"              TEXT    NOT NULL,
  "mimeType"          TEXT    NOT NULL,
  "category"          TEXT    NOT NULL DEFAULT 'archive',
  "size"              INTEGER NOT NULL,
  "url"               TEXT    NOT NULL,
  "parseStatus"       TEXT    NOT NULL DEFAULT 'unparsed',
  "vectorIndexStatus" TEXT    NOT NULL DEFAULT 'unindexed',
  "parseSummary"      TEXT,
  "tags"              TEXT    NOT NULL DEFAULT '[]',
  "relatedProjectId"  TEXT,
  "versions"          TEXT    NOT NULL DEFAULT '[]',
  "operatedBy"        TEXT    NOT NULL DEFAULT '',
  "deletedAt"         DATETIME,
  "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_idx"            ON "FileRecord"("workspaceId");
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_category_idx"   ON "FileRecord"("workspaceId", "category");
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_parseStatus_idx" ON "FileRecord"("workspaceId", "parseStatus");
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_createdAt_idx"  ON "FileRecord"("workspaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "FileRecord_deletedAt_idx"              ON "FileRecord"("deletedAt");
