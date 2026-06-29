#!/usr/bin/env node
/**
 * 在本地 SQLite dev.db 中创建 FileRecord 表
 * 运行：node scripts/create-file-record-table.js
 */
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "../dev.db");
if (!fs.existsSync(dbPath)) {
  console.error("❌ dev.db 不存在:", dbPath);
  process.exit(1);
}

let Database;
try {
  Database = require(path.join(__dirname, "../apps/web/node_modules/better-sqlite3"));
} catch {
  console.error("❌ 请先安装 better-sqlite3：pnpm add -D better-sqlite3");
  process.exit(1);
}

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS "FileRecord" (
  "id"                TEXT     NOT NULL PRIMARY KEY,
  "workspaceId"       TEXT     NOT NULL,
  "name"              TEXT     NOT NULL,
  "type"              TEXT     NOT NULL,
  "mimeType"          TEXT     NOT NULL,
  "category"          TEXT     NOT NULL DEFAULT 'archive',
  "size"              INTEGER  NOT NULL,
  "url"               TEXT     NOT NULL,
  "parseStatus"       TEXT     NOT NULL DEFAULT 'unparsed',
  "vectorIndexStatus" TEXT     NOT NULL DEFAULT 'unindexed',
  "parseSummary"      TEXT,
  "tags"              TEXT     NOT NULL DEFAULT '[]',
  "relatedProjectId"  TEXT,
  "versions"          TEXT     NOT NULL DEFAULT '[]',
  "operatedBy"        TEXT     NOT NULL DEFAULT '',
  "deletedAt"         DATETIME,
  "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_idx" ON "FileRecord"("workspaceId");
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_category_idx" ON "FileRecord"("workspaceId","category");
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_parseStatus_idx" ON "FileRecord"("workspaceId","parseStatus");
CREATE INDEX IF NOT EXISTS "FileRecord_workspaceId_createdAt_idx" ON "FileRecord"("workspaceId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "FileRecord_deletedAt_idx" ON "FileRecord"("deletedAt");
`);

console.log("✅ FileRecord 表已创建（或已存在）");
db.close();
