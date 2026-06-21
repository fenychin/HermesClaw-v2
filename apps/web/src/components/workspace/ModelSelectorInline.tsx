"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SELECTABLE_MODELS, type SelectableModel } from "@/config/models";

interface ModelSelectorInlineProps {
  value: string; // model ID (e.g. "deepseek-v4-pro")
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelectorInline({ value, onChange, disabled }: ModelSelectorInlineProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = SELECTABLE_MODELS.find((m) => m.id === value) ?? SELECTABLE_MODELS[0];

  // 按 Provider 分组
  const groups = SELECTABLE_MODELS.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, SelectableModel[]>);

  const providerLabels: Record<string, string> = {
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
          "bg-[#171717]/80 hover:bg-[#262626] border border-border/80 text-foreground font-medium shadow-sm",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        title={`${current.label} ${current.version}`}
      >
        <span className={cn("size-2 rounded-full shrink-0 animate-pulse", current.color)} />
        <span>{current.label}</span>
        <span className="text-hint text-[10px] hidden sm:inline">{current.version}</span>
        <ChevronDown className={cn("size-3 text-hint transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute top-full left-0 mt-2 w-56 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="py-1">
              <p className="text-hint text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider">
                选择模型
              </p>
              {Object.entries(groups).map(([provider, models]) => (
                <div key={provider} className="mb-1 last:mb-0">
                  <p className="text-hint text-[9px] px-3 py-0.5 uppercase tracking-wider opacity-60 border-t border-border/20 pt-1.5 first:border-0 first:pt-0">
                    {providerLabels[provider] ?? provider}
                  </p>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.available}
                      onClick={() => {
                        if (!m.available) return;
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                        m.id === value ? "bg-accent" : "hover:bg-accent",
                        !m.available && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      <span className={cn("size-2.5 rounded-full shrink-0", m.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm font-medium flex items-center gap-2">
                          {m.version}
                          {m.id === value && (
                            <span className="text-success text-[9px] font-normal">✓ 当前</span>
                          )}
                        </p>
                      </div>
                      {!m.available && (
                        <span className="text-hint text-[9px] shrink-0">需 API Key</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
