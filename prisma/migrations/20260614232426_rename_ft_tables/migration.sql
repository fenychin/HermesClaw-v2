-- CLAUDE.md §6.1：把外贸专属表打上 ft_* 命名空间，标注为 Industry Pack 私有资产
-- TS 模型名（Inquiry / Quotation / ...）通过 @@map 解耦，业务代码无需改动

ALTER TABLE "Inquiry" RENAME TO "ft_inquiry";
ALTER TABLE "Quotation" RENAME TO "ft_quotation";
ALTER TABLE "MarketIntelligence" RENAME TO "ft_market_intelligence";
ALTER TABLE "ExchangeRate" RENAME TO "ft_exchange_rate";
ALTER TABLE "Report" RENAME TO "ft_report";

-- 重建索引（SQLite 在 RENAME TABLE 时索引名不会自动跟随，需重命名）
DROP INDEX IF EXISTS "Inquiry_workspaceId_idx";
CREATE INDEX "ft_inquiry_workspaceId_idx" ON "ft_inquiry"("workspaceId");

DROP INDEX IF EXISTS "Quotation_workspaceId_idx";
CREATE INDEX "ft_quotation_workspaceId_idx" ON "ft_quotation"("workspaceId");

DROP INDEX IF EXISTS "MarketIntelligence_workspaceId_idx";
CREATE INDEX "ft_market_intelligence_workspaceId_idx" ON "ft_market_intelligence"("workspaceId");

DROP INDEX IF EXISTS "ExchangeRate_workspaceId_idx";
DROP INDEX IF EXISTS "ExchangeRate_workspaceId_pair_key";
CREATE INDEX "ft_exchange_rate_workspaceId_idx" ON "ft_exchange_rate"("workspaceId");
CREATE UNIQUE INDEX "ft_exchange_rate_workspaceId_pair_key" ON "ft_exchange_rate"("workspaceId", "pair");

DROP INDEX IF EXISTS "Report_workspaceId_generatedAt_idx";
CREATE INDEX "ft_report_workspaceId_generatedAt_idx" ON "ft_report"("workspaceId", "generatedAt");
