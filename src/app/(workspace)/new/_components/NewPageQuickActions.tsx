"use client";

import { motion } from "framer-motion";
import { Filter, Mail, UserCheck, FileText } from "lucide-react";
import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";

/**
 * 快捷动作项的接口定义
 */
interface QuickActionItem {
  /** 唯一标识符 */
  key: string;
  /** 卡片标题 */
  label: string;
  /** 快捷操作描述 */
  desc: string;
  /** Lucide 图标组件引用 */
  icon: typeof Filter;
  /** 点击后填充输入框的预设提示词 */
  prompt: string;
  /** 可选的外贸智能体专属系统提示词 */
  systemPrompt?: string;
}

/**
 * 快捷操作列表配置（对应外贸专项工作流）
 */
const QUICK_ACTIONS: ReadonlyArray<QuickActionItem> = [
  {
    key: "inquiry-analysis",
    label: "询盘分级",
    desc: "粘贴询盘内容，AI 立即分级并推荐策略",
    icon: Filter,
    prompt: "请帮我分析以下询盘，判断客户意向并进行分级：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.inquiryAnalysis,
  },
  {
    key: "development-letter",
    label: "开发信生成",
    desc: "输入目标客户信息，一键生成个性化开发信",
    icon: Mail,
    prompt: "请帮我为以下客户生成一封专业的英文开发信，客户信息：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.developmentLetter,
  },
  {
    key: "client-followup",
    label: "客户跟进",
    desc: "制定跟进节奏建议，生成个性化沟通内容",
    icon: UserCheck,
    prompt: "请帮我为以下客户制定跟进计划与沟通建议：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.customerProfile,
  },
  {
    key: "quotation-generation",
    label: "报价生成",
    desc: "输入产品与目标市场，快速生成专业报价单",
    icon: FileText,
    prompt: "请帮我制定以下产品的报价方案和报价策略：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.quotation,
  },
];

/**
 * NewPageQuickActions 组件的 Props 定义
 */
interface NewPageQuickActionsProps {
  /** 选择卡片时的回调，返回 prompt 及其 systemPrompt */
  onSelect: (prompt: string, systemPrompt?: string) => void;
}

/**
 * 快捷操作卡片区域组件
 * 展示 2×2 网格，提供四个极简的外贸相关快捷卡片入口
 */
export function NewPageQuickActions({ onSelect }: NewPageQuickActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 mt-6">
      {QUICK_ACTIONS.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.div
            key={action.key}
            onClick={() => onSelect(action.prompt, action.systemPrompt)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05,
              ease: "easeOut",
            }}
            className="bg-card rounded-2xl border border-border p-4 hover:border-primary/40 cursor-pointer transition-all flex flex-col items-start gap-2 group hover:shadow-md"
          >
            {/* 图标 (18px, text-primary) */}
            <Icon size={18} className="text-primary group-hover:scale-105 transition-transform" />
            
            {/* 标题 (text-foreground text-sm font-medium) */}
            <h3 className="text-foreground text-sm font-medium">
              {action.label}
            </h3>
            
            {/* 描述 (text-muted-foreground text-xs, 一行) */}
            <p className="text-muted-foreground text-xs truncate w-full text-left">
              {action.desc}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
