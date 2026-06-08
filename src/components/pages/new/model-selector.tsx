"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ModelProvider } from "@/types/chat";
import { AVAILABLE_MODELS } from "@/types/chat";

interface ModelSelectorProps {
  /** 当前选中的 provider */
  value: ModelProvider;
  /** 选择回调 */
  onChange: (provider: ModelProvider) => void;
  /** 是否禁用（发送中时不可换模型） */
  disabled?: boolean;
}

/** provider → 状态色映射 */
const PROVIDER_COLORS: Record<string, string> = {
  deepseek: "bg-success",
  openai: "bg-brand-blue",
  anthropic: "bg-primary",
  gemini: "bg-warning",
  minimax: "bg-chart-4",
};

/**
 * 模型选择器
 * —— 使用 shadcn DropdownMenu，显示当前模型 + 切换能力。
 */
export function ModelSelector({
  value,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const current = AVAILABLE_MODELS.find((m) => m.provider === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg",
          "text-xs font-medium text-muted-foreground",
          "hover:bg-accent hover:text-foreground transition-colors",
          "border border-border",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {/* 状态圆点 */}
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            PROVIDER_COLORS[value] ?? "bg-hint",
          )}
        />
        <span>{current?.label ?? value}</span>
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        {AVAILABLE_MODELS.map((m) => (
          <DropdownMenuItem
            key={m.provider}
            onClick={() => onChange(m.provider)}
            className={cn(
              "flex items-center gap-3 cursor-pointer",
              m.provider === value && "bg-accent",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full shrink-0",
                PROVIDER_COLORS[m.provider] ?? "bg-hint",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium">
                {m.label}
              </p>
              <p className="text-hint text-xs truncate">
                {m.description}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
