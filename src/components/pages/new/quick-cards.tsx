"use client";

import { useRef, useState, useEffect, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
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
  desc: string;
  color: string;
  prompt: string;
  systemPrompt?: string;
}> = [
  {
    key: "analyze-inquiry",
    icon: Search,
    label: "分析询盘",
    desc: "粘贴询盘内容，AI 立即分析客户意图",
    color: "text-brand-blue",
    prompt: "请帮我分析以下询盘，判断客户意向和优先级：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.inquiryAnalysis,
  },
  {
    key: "cold-email",
    icon: Mail,
    label: "生成开发信",
    desc: "输入目标客户信息，生成个性化开发信",
    color: "text-primary",
    prompt: "请帮我为以下客户生成一封专业的英文开发信，客户信息：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.developmentLetter,
  },
  {
    key: "quotation",
    icon: FileText,
    label: "创建报价单",
    desc: "从产品库调取信息，快速生成报价",
    color: "text-success",
    prompt: "请帮我制定以下产品的报价策略：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.quotation,
  },
  {
    key: "client-profile",
    icon: UserSearch,
    label: "客户画像",
    desc: "分析客户背景、采购习惯、决策链",
    color: "text-warning",
    prompt: "请帮我分析以下客户的背景、采购习惯和决策链：\n",
    systemPrompt: TRADE_AGENT_PROMPTS.customerProfile,
  },
  {
    key: "create-project",
    icon: FolderPlus,
    label: "创建项目空间",
    desc: "为新客户或订单建立独立工作空间",
    color: "text-primary",
    prompt: "请帮我为新客户或订单建立一个独立工作空间：",
  },
  {
    key: "call-agent",
    icon: Bot,
    label: "调用智能体",
    desc: "直接指定数字员工执行具体任务",
    color: "text-brand-blue",
    prompt: "我想调用数字员工执行以下任务：",
  },
];

/** 卡片入场动画延迟（逐张错开） */
const STAGGER_DELAY = 0.06;

interface QuickCardsProps {
  /**
   * 点击卡片回调：传递预设 prompt 与可选专属 system prompt，
   * 由父组件填入 CommandBox 并在发送时一并提交。
   */
  onSelect?: (prompt: string, systemPrompt?: string) => void;
}

/**
 * 快捷任务卡片组
 * —— 水平排列 6 张，支持横向滚动，hover 微放大。
 *    点击后将预设 prompt 填入输入框并聚焦；外贸专项卡片附带专属角色 prompt。
 *    左侧/右侧箭头在可滚动时出现，点击滑动一页。
 */
export function QuickCards({ onSelect }: QuickCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const handleClick = (prompt: string, systemPrompt?: string) => {
    onSelect?.(prompt, systemPrompt);
  };

  /** 检查滚动边界，更新箭头显示状态 */
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  /** 向左/右滚动一页（约 3 张卡片宽度） */
  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 176; // min-w-[160px] + gap
    const scrollAmount = cardWidth * 3;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative group/scroll">
      {/* 左箭头 */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 z-10",
            "size-8 rounded-full bg-card border border-border shadow-md",
            "flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            "transition-all opacity-0 group-hover/scroll:opacity-100",
            "-ml-1",
          )}
          aria-label="向左滚动"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}

      {/* 卡片容器 */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {QUICK_CARDS.map((card, i) => (
          <motion.button
            key={card.key}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: 0.15 + i * STAGGER_DELAY,
              ease: "easeOut",
            }}
            onClick={() => handleClick(card.prompt, card.systemPrompt)}
            className={cn(
              "min-w-[160px] bg-card rounded-xl border border-border p-3 shrink-0",
              "cursor-pointer text-left",
              "hover:scale-[1.02] hover:shadow-sm transition-transform",
            )}
          >
            {/* 图标 */}
            <card.icon className={cn("size-6", card.color)} />

            {/* 标题 */}
            <p className="text-foreground text-xs font-medium mt-2">
              {card.label}
            </p>

            {/* 说明 */}
            <p className="text-muted-foreground text-[11px] mt-1 line-clamp-2">
              {card.desc}
            </p>
          </motion.button>
        ))}
      </div>

      {/* 右箭头 */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 z-10",
            "size-8 rounded-full bg-card border border-border shadow-md",
            "flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            "transition-all opacity-0 group-hover/scroll:opacity-100",
            "-mr-1",
          )}
          aria-label="向右滚动"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}
