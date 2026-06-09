"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// 极简大厂模型 Logo SVG 图标组件
// ============================================================

/** Anthropic (Claude) 花瓣/星芒 SVG */
export const AnthropicIcon = () => (
  <svg className="size-4 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2c.4 0 .7.3.7.7v4.6c0 .4-.3.7-.7.7s-.7-.3-.7-.7V2.7c0-.4.3-.7.7-.7zm5 2.1c.3-.3.8-.3 1 0l3.3 3.3c.3.3.3.8 0 1-.3.3-.8.3-1 0l-3.3-3.3c-.3-.3-.3-.8 0-1zm-10 0c.3.3.3.8 0 1L3.7 8.4c-.3.3-.8.3-1 0-.3-.3-.3-.8 0-1l3.3-3.3c.3-.3.8-.3 1 0zM2 12c0-.4.3-.7.7-.7h4.6c.4 0 .7.3.7.7s-.3.7-.7.7H2.7c-.4 0-.7-.3-.7-.7zm14.7 0c0-.4.3-.7.7-.7h4.6c.4 0 .7.3.7.7s-.3.7-.7.7h-4.6c-.4 0-.7-.3-.7-.7zm-11 3.7c.3-.3.8-.3 1 0l3.3 3.3c.3.3.3.8 0 1-.3.3-.8.3-1 0l-3.3-3.3c-.3-.3-.3-.8 0-1zm10.7 0c.3.3.3.8 0 1l-3.3 3.3c-.3.3-.8.3-1 0s-.3-.8 0-1l3.3-3.3c.3-.3.8-.3 1 0zM12 16.7c.4 0 .7.3.7.7v4.6c0 .4-.3.7-.7.7s-.7-.3-.7-.7v-4.6c0-.4.3-.7.7-.7z" />
  </svg>
);

/** Gemini (Google) 双四角星芒 */
export const GeminiIcon = () => (
  <svg className="size-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2c0 3.5-2.5 6-6 6 3.5 0 6 2.5 6 6 0-3.5 2.5-6 6-6-3.5 0-6-2.5-6-6zm6 11c0 2-1.5 3.5-3.5 3.5 2 0 3.5 1.5 3.5 3.5 0-2 1.5-3.5 3.5-3.5-2 0-3.5-1.5-3.5-3.5z" />
  </svg>
);

/** OpenAI (GPT) 螺旋图 */
export const OpenAIIcon = () => (
  <svg className="size-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.3 9c-.4-1.2-1.2-2.2-2.3-2.9l.8-1.4c.2-.3.1-.7-.2-.9-.3-.2-.7-.1-.9.2l-.8 1.4c-1.3-.4-2.7-.4-4 0L12 4c-.2-.3-.6-.4-.9-.2-.3.2-.4.6-.2.9l.8 1.4c-1.1.7-1.9 1.7-2.3 2.9l-1.4-.8c-.3-.2-.7-.1-.9.2-.2.3-.1.7.2.9l1.4.8c-.4 1.3-.4 2.7 0 4l-1.4.8c-.3.2-.4.6-.2.9.2.3.6.4.9.2l1.4-.8c.4 1.2 1.2 2.2 2.3 2.9l-.8 1.4c-.2.3-.1.7.2.9.1.1.2.1.3.1.2 0 .4-.1.5-.3l.8-1.4c1.3.4 2.7.4 4 0l.8 1.4c.1.2.3.3.5.3.1 0 .2 0 .3-.1.3-.2.4-.6.2-.9l-.8-1.4c1.1-.7 1.9-1.7 2.3-2.9l1.4.8c.1.1.2.1.3.1.2 0 .4-.1.5-.3.2-.3.1-.7-.2-.9l-1.4-.8c.4-1.3.4-2.7 0-4l1.4-.8c.3-.2.4-.6.2-.9-.2-.3-.6-.4-.9-.2l-1.4.8zM12 13.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5 0 1.5 1.5c0 .8-.7 1.5-1.5 1.5z" />
  </svg>
);

/** MiniMax 波形图 */
export const MiniMaxIcon = () => (
  <svg className="size-4 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0" />
  </svg>
);

// ============================================================
// 模型数据接口定义
// ============================================================

export interface ModelInfo {
  id: string;
  label: string;
  icon: () => React.JSX.Element;
  desc?: string;
  isLocked?: boolean;
  isNew?: boolean;
  isLowLatency?: boolean;
  hasSubmenu?: boolean;
}

export interface GroupInfo {
  name: string;
  items: ModelInfo[];
}

/**
 * 完整模型列表与分组配置
 */
export const MODEL_GROUPS: ReadonlyArray<GroupInfo> = [
  {
    name: "Anthropic",
    items: [
      {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        desc: "需要付费计划",
        icon: AnthropicIcon,
        isLocked: true,
      },
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        icon: AnthropicIcon,
        isLowLatency: true,
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        icon: AnthropicIcon,
        isLowLatency: true,
      },
      {
        id: "claude-legacy",
        label: "旧版本",
        icon: AnthropicIcon,
        hasSubmenu: true,
      },
    ],
  },
  {
    name: "Google",
    items: [
      {
        id: "gemini-3-1-pro",
        label: "Gemini 3.1 Pro",
        icon: GeminiIcon,
      },
      {
        id: "gemini-3-5-flash",
        label: "Gemini 3.5 Flash",
        icon: GeminiIcon,
        isNew: true,
      },
    ],
  },
  {
    name: "OpenAI",
    items: [
      {
        id: "gpt-5-5",
        label: "GPT-5.5",
        icon: OpenAIIcon,
        isNew: true,
        isLowLatency: true,
      },
    ],
  },
  {
    name: "MiniMax",
    items: [
      {
        id: "minimax-m3",
        label: "MiniMax M3",
        icon: MiniMaxIcon,
        isNew: true,
        isLowLatency: true,
      },
    ],
  },
];

// 提取所有单体模型列表
const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.items);

interface NewModelSelectorProps {
  /** 当前选中的模型 ID */
  selectedId: string;
  /** 选中模型后的回调 */
  onSelect: (id: string) => void;
  /** 是否处于禁用状态 */
  disabled?: boolean;
}

/**
 * 极简 Apple 风格模型选择器
 * —— 绝对定位在左上角
 * —— 交互弹窗样式完全对齐图 2 (锁🔒，NEW 标签，低延迟状态，“旧版本”子节点等)
 */
export function NewModelSelector({
  selectedId,
  onSelect,
  disabled = false,
}: NewModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取当前选中的模型对象
  const currentModel = ALL_MODELS.find((m) => m.id === selectedId) || ALL_MODELS[1];
  const CurrentIcon = currentModel.icon;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (model: ModelInfo) => {
    if (model.isLocked || model.hasSubmenu) return;
    onSelect(model.id);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative z-30">
      {/* 触发按钮：极简文本 + 图标 + 向下箭头 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-foreground font-semibold text-sm",
          "hover:bg-accent/40 active:bg-accent/80 transition-colors cursor-pointer select-none",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <CurrentIcon />
        <span>{currentModel.label}</span>
        <ChevronDown size={14} className={cn("text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {/* 下拉浮层菜单 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 mt-1.5 w-64 bg-popover border border-border rounded-xl shadow-2xl p-1.5 z-50 overflow-hidden"
          >
            {/* 移除了 max-h 与 overflow-y 滚动限制，自适应全高展开，彻底消除白色滚动条 */}
            <div className="space-y-1">
              {MODEL_GROUPS.map((group) => (
                <div key={group.name} className="mb-2 last:mb-0">
                  {/* 分组名称 */}
                  <div className="text-muted-foreground text-[10px] font-bold px-2 py-1 uppercase tracking-wider select-none">
                    {group.name}
                  </div>

                  {/* 分组模型列表 */}
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const IconComponent = item.icon;
                      const isSelected = item.id === selectedId;

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleItemClick(item)}
                          className={cn(
                            "flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-all select-none",
                            item.isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent text-foreground",
                            item.hasSubmenu && "hover:bg-accent text-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <IconComponent />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{item.label}</span>
                              {item.desc && (
                                <span className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
                                  {item.desc}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 右侧状态修饰区 */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* 付费锁定标志 */}
                            {item.isLocked && <Lock size={12} className="text-muted-foreground" />}

                            {/* 低延迟标志 "低 >" */}
                            {item.isLowLatency && !isSelected && (
                              <span className="text-muted-foreground text-xs flex items-center gap-0.5 scale-90">
                                低 <ChevronRight size={10} />
                              </span>
                            )}

                            {/* NEW 标志 */}
                            {item.isNew && (
                              <span className="bg-success/10 text-success text-[9px] px-1 py-0.5 rounded font-bold tracking-wider scale-90">
                                NEW
                              </span>
                            )}

                            {/* 子菜单标志 */}
                            {item.hasSubmenu && <ChevronRight size={12} className="text-muted-foreground" />}

                            {/* 选中钩子 */}
                            {isSelected && <Check size={14} className="text-foreground" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
