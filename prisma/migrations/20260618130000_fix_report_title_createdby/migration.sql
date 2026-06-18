-- TD-2026-06-17-003 RESOLVED: Add title and createdBy to Report
-- SQLite supports ADD COLUMN with TEXT DEFAULT

ALTER TABLE "Report" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Report" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system';
