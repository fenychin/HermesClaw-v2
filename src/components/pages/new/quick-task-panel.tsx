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
 * —— 直连 POST /api/task（结构化置信度护栏）。
 *    置信度 < 0.7 时渲染「需人工复核」条，体现 AGENTS.md 4.5 人机切换阈值。
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
    <div className="bg-card border-border space-y-3 rounded-xl border p-4">
      {/* 任务类型选择 */}
      <div className="flex flex-wrap gap-1.5">
        {TASK_TYPES.map((t) => {
          const Icon = t.icon;
          const active = taskType === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTaskType(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 输入区 */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="粘贴询盘 / 客户信息 / 产品信息，运行结构化快捷任务…"
        rows={3}
        className="bg-background border-border text-foreground placeholder:text-hint focus:ring-ring/40 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
      />

      {/* 运行按钮 */}
      <div className="flex items-center justify-between">
        <span className="text-hint text-xs">
          结果附带模型置信度，低于 0.7 将提示人工复核
        </span>
        <button
          type="button"
          onClick={run}
          disabled={loading || !input.trim()}
          className="bg-brand hover:bg-brand/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              执行中…
            </>
          ) : (
            "运行任务"
          )}
        </button>
      </div>

      {/* 错误 */}
      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger rounded-lg border px-3 py-2 text-xs">
          {error}
        </div>
      ) : null}

      {/* 结果 */}
      <AnimatePresence>
        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {/* 需人工复核条（置信度护栏命中） */}
            {needsHuman ? (
              <div className="border-warning/30 bg-warning/5 space-y-2 rounded-lg border px-3 py-2.5">
                <div className="text-warning flex items-center gap-2 text-xs font-medium">
                  <ShieldAlert className="size-4" />
                  低置信度，需人工复核
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {result.reason}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAccepted(true)}
                    className="bg-warning/10 text-warning hover:bg-warning/20 rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  >
                    仍然采用
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="text-muted-foreground hover:bg-accent rounded-md px-3 py-1 text-xs transition-colors"
                  >
                    转人工处理
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-success flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="size-3.5" />
                已完成
                {result.confidence !== null
                  ? ` · 置信度 ${(result.confidence * 100).toFixed(0)}%`
                  : ""}
              </div>
            )}

            {/* 结果正文（需人工且未采用时弱化展示） */}
            <div
              className={cn(
                "border-border bg-background max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-xs leading-relaxed",
                needsHuman ? "text-hint" : "text-muted-foreground",
              )}
            >
              {result.result}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
