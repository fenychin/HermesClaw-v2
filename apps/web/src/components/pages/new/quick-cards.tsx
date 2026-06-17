"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";
import {
  Search,
  Mail,
  FileText,
  UserSearch,
  FolderPlus,
  Bot,
} from "lucide-react";

/**
 * 快捷任务卡片数据（PRD 10.1 外贸首批工作流）
 * —— prompt：点击后填入输入框的引导提示词。
 *    systemPrompt：可选的专属 system prompt（外贸专项卡片接入 TRADE_AGENT_PROMPTS，
 *    使发送时由对应「数字员工」角色处理；无则走 Hermes 规划助手默认角色）。
 */
const QUICK_CARDS: ReadonlyArray<{
  key: string;
  icon: typeof Search;
  label: string;
  color: string;
  prompt: string;
  systemPrompt?: string;
  workflowEnabled: boolean;
}> = [
  {
    key: "analyze-inquiry",
    icon: Search,
    label: "分析询盘",
    color: "text-brand-blue",
    prompt: "请帮我分析以下询盘，判断客户意向和优先级：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.inquiryAnalysis,
    workflowEnabled: true,
  },
  {
    key: "cold-email",
    icon: Mail,
    label: "生成开发信",
    color: "text-primary",
    prompt: "请帮我为以下客户生成一封专业的英文开发信，客户信息：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.developmentLetter,
    workflowEnabled: true,
  },
  {
    key: "quotation",
    icon: FileText,
    label: "创建报价单",
    color: "text-success",
    prompt: "请帮我制定以下产品的报价策略：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.quotation,
    workflowEnabled: true,
  },
  {
    key: "client-profile",
    icon: UserSearch,
    label: "客户画像",
    color: "text-warning",
    prompt: "请帮我分析以下客户的背景、采购习惯和决策链：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.customerProfile,
    workflowEnabled: true,
  },
  {
    key: "create-project",
    icon: FolderPlus,
    label: "创建项目空间",
    color: "text-primary",
    prompt: "请帮我为新客户或订单建立一个独立工作空间：",
    workflowEnabled: true,
  },
  {
    key: "call-agent",
    icon: Bot,
    label: "调用智能体",
    color: "text-brand-blue",
    prompt: "我想调用数字员工执行以下任务：",
    workflowEnabled: true,
  },
];

/** 卡片入场动画延迟（逐行错开） */
const STAGGER_DELAY = 0.06;

interface QuickCardsProps {
  /**
   * 点击卡片回调：传递预设 prompt 与可选专属 system prompt，
   * 由父组件填入 CommandBox 并在发送时一并提交。
   */
  onSelect?: (prompt: string, systemPrompt?: string) => void;
  onWorkflowSelect?: (cardKey: string) => void;  // 新增
}

/**
 * 快捷任务卡片组
 * —— 双排 3×2 紧凑网格布局，hover 微提亮。
 *    点击后将预设 prompt 填入输入框并聚焦；外贸专项卡片附带专属角色 prompt。
 */
export function QuickCards({ onSelect, onWorkflowSelect }: QuickCardsProps) {
  const handleClick = (key: string, prompt: string, systemPrompt?: string) => {
    if (onWorkflowSelect) {
      onWorkflowSelect(key);
    } else {
      onSelect?.(prompt, systemPrompt);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {QUICK_CARDS.map((card, i) => (
        <motion.button
          key={card.key}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.25,
            delay: 0.1 + i * STAGGER_DELAY,
            ease: "easeOut",
          }}
          onClick={() => handleClick(card.key, card.prompt, card.systemPrompt)}
          className={cn(
            "flex flex-row items-center gap-2 px-3 py-2.5 rounded-xl",
            "bg-card border border-border",
            "cursor-pointer",
            "hover:bg-accent hover:border-muted-foreground/20",
            "transition-colors",
          )}
        >
          {/* 图标 */}
          <card.icon className={cn("size-4 shrink-0", card.color)} />

          {/* 标题 */}
          <span className="text-foreground text-[11px] font-medium leading-tight truncate">
            {card.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
