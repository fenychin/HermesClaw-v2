-- HARNESS-SPRINT2: 为 HarnessProposal 增加审批/Canary/回滚相关字段
-- 字段全部 nullable，向后兼容：旧数据保持原状态语义。

ALTER TABLE "HarnessProposal" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "HarnessProposal" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "HarnessProposal" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "HarnessProposal" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "HarnessProposal" ADD COLUMN "rolledBackBy" TEXT;
ALTER TABLE "HarnessProposal" ADD COLUMN "rolledBackAt" DATETIME;
ALTER TABLE "HarnessProposal" ADD COLUMN "canaryStartedAt" DATETIME;
ALTER TABLE "HarnessProposal" ADD COLUMN "canaryConfig" JSONB;
ALTER TABLE "HarnessProposal" ADD COLUMN "canaryCompletedAt" DATETIME;
ALTER TABLE "HarnessProposal" ADD COLUMN "canaryRollbackReason" TEXT;

-- 用于 cron 扫 status='canary' 提案时按起跳时间排序/范围过滤
CREATE INDEX "HarnessProposal_canaryStartedAt_idx" ON "HarnessProposal"("canaryStartedAt");
