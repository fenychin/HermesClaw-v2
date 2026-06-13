-- AlterTable: 为 HarnessProposal 新增 previousSnapshot 字段
-- 存储变更前关联 Agent 的任务边界与工具访问快照（JSON），用于一键回滚
ALTER TABLE "HarnessProposal" ADD COLUMN "previousSnapshot" TEXT;
