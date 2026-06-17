"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Mail,
  FileText,
  UserSearch,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

/** 快捷任务类型（对应后端 TRADE_AGENT_PROMPTS 的 key） */
const TASK_TYPES = [
  { key: "inquiryAnalysis", label: "询盘分析", icon: Search },
  { key: "developmentLetter", label: "开发信", icon: Mail },
  { key: "quotation", label: "报价策略", icon: FileText },
  { key: "customerProfile", label: "客户画像", icon: UserSearch },
] as const;

type TaskTypeKey = (typeof TASK_TYPES)[number]["key"];

/** /api/task 响应体 */
interface TaskResponse {
  status: "ok" | "needs_human";
  result: string;
  confidence: number | null;
  suggestedActions: string[];
  reason?: string;
}

/**
 * 快捷任务面板
 * —— 极具质感的现代化 UI 优化版本
 */
export function QuickTaskPanel() {
  const [taskType, setTaskType] = useState<TaskTypeKey>("inquiryAnalysis");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 用户已确认采用低置信度结果 */
  const [accepted, setAccepted] = useState(false);

  const run = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAccepted(false);
    try {
      const res = await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType, input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "任务执行失败");
      }
      setResult(data as TaskResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "任务执行失败");
    } finally {
      setLoading(false);
    }
  };

  const needsHuman = result?.status === "needs_human" && !accepted;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute -left-20 -top-20 size-64 rounded-full bg-brand/10 blur-[80px]" />
      
      <div className="relative space-y-5">
        {/* 任务类型选择 (Segmented Control Style) */}
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-black/20 p-1.5 w-fit border border-white/5">
          {TASK_TYPES.map((t) => {
            const Icon = t.icon;
            const active = taskType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTaskType(t.key)}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-300",
                  active
                    ? "text-brand"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                {active && (
                  <motion.div
                    layoutId="activeTaskTab"
                    className="absolute inset-0 rounded-lg bg-brand/15 border border-brand/20 shadow-[0_0_15px_rgba(var(--brand-rgb),0.1)]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <Icon className={cn("size-4 relative z-10", active && "drop-shadow-[0_0_8px_rgba(var(--brand-rgb),0.5)]")} />
                <span className="relative z-10 tracking-wide">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* 输入区 */}
        <div className="relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴询盘 / 客户信息 / 产品信息，运行结构化快捷任务…"
            rows={4}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-all duration-300 focus:border-brand/40 focus:bg-black/40 focus:ring-4 focus:ring-brand/10 shadow-inner"
          />
          <div className="absolute bottom-3 right-3 text-brand/40 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100">
            <Sparkles className="size-4 animate-pulse" />
          </div>
        </div>

        {/* 底部信息与运行按钮 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/80 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            <Info className="size-3.5" />
            <span>结果附带模型置信度，低于 <strong className="text-foreground/80 font-semibold">0.7</strong> 将提示人工复核</span>
          </div>
          
          <button
            type="button"
            onClick={run}
            disabled={loading || !input.trim()}
            className="group relative overflow-hidden rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-brand/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-brand/40 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all duration-1000 group-hover:translate-x-full" />
            
            <div className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>执行中…</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4 transition-transform duration-300 group-hover:rotate-12" />
                  <span>运行任务</span>
                </>
              )}
            </div>
          </button>
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 border border-danger/20 bg-danger/10 text-danger rounded-xl px-4 py-3 text-xs flex items-center gap-2 backdrop-blur-sm">
                <ShieldAlert className="size-4 shrink-0" />
                <p>{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 结果区 */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
              className="mt-4 space-y-3"
            >
              {/* 需人工复核条（置信度护栏命中） */}
              {needsHuman ? (
                <div className="relative overflow-hidden border border-warning/30 bg-warning/10 space-y-3 rounded-xl px-4 py-3.5 backdrop-blur-md shadow-lg shadow-warning/5">
                  <div className="absolute top-0 left-0 w-1 h-full bg-warning/50" />
                  <div className="text-warning flex items-center gap-2 text-sm font-bold tracking-wide">
                    <ShieldAlert className="size-4.5" />
                    低置信度，需人工复核
                  </div>
                  <p className="text-warning/80 text-xs leading-relaxed font-medium">
                    {result.reason}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAccepted(true)}
                      className="bg-warning hover:bg-warning/90 text-warning-foreground rounded-lg px-4 py-1.5 text-xs font-bold transition-all shadow-md shadow-warning/20 hover:scale-105 active:scale-95"
                    >
                      仍然采用
                    </button>
                    <button
                      type="button"
                      onClick={() => setResult(null)}
                      className="bg-black/20 text-muted-foreground hover:text-foreground hover:bg-black/40 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all border border-white/5 hover:border-white/10"
                    >
                      转人工处理
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-success flex items-center gap-2 text-xs font-semibold bg-success/10 w-fit px-3 py-1.5 rounded-lg border border-success/20">
                  <CheckCircle2 className="size-4" />
                  <span>已完成</span>
                  {result.confidence !== null && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-success/50 mx-1" />
                      <span className="opacity-90">置信度 {(result.confidence * 100).toFixed(0)}%</span>
                    </>
                  )}
                </div>
              )}

              {/* 结果正文 */}
              <div
                className={cn(
                  "border border-white/10 bg-black/40 backdrop-blur-xl max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl p-4 text-[13px] leading-relaxed shadow-inner",
                  needsHuman ? "text-hint blur-[0.5px] select-none" : "text-foreground/90",
                )}
              >
                {result.result}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
