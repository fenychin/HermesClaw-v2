-- AlterTable: Skill 添加 automationLevel 字段（AGENTS.md §4.7 自动化授权分级）
ALTER TABLE "Skill" ADD COLUMN "automationLevel" TEXT NOT NULL DEFAULT 'L2';

-- AlterTable: AgentLog 添加 riskLevel 字段（AGENTS.md §4.4 闭环反馈）
ALTER TABLE "AgentLog" ADD COLUMN "riskLevel" TEXT;
