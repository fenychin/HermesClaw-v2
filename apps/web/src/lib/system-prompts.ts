/**
 * Hermes 智能控制面系统 Prompt 常量（已解耦为行业包动态加载）
 * —— 集中管理所有 AI 角色 Prompt 的 Key，实际长文本从行业包 prompts 目录加载。
 */

export const HERMES_SYSTEM_PROMPT = "hermes";

export const TRADE_AGENT_PROMPTS = {
  inquiryAnalysis: "inquiry-analysis",
  developmentLetter: "development-letter",
  quotation: "quotation",
  customerProfile: "customer-profile",
} as const;
