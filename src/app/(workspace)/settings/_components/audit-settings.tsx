"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search, Filter, ChevronDown, RefreshCw, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { SkeletonList } from "@/components/common/skeleton-list";
import { cn } from "@/lib/utils";

/** 后端返回的审计日志条目 */
interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
  riskLevel?: "low" | "medium" | "high";
  automationLevel?: string;
  triggeredBy: string;
  status: string;
  createdAt: string; // ISO
}

const RISK_CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: "低", className: "bg-success/10 text-success border-success/30" },
  medium: { label: "中", className: "bg-warning/10 text-warning border-warning/30" },
  high: { label: "高", className: "bg-danger/10 text-danger border-danger/30" },
};

const AUTOMATION_CONFIG: Record<string, string> = {
  L1: "全自动",
  L2: "建议执行",
  L3: "需确认",
  L4: "禁止自动",
};

/** 格式化 ISO → "MM/DD HH:mm:ss" */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function AuditSettings() {
  const [filterText, setFilterText] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: logs = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const data = await apiClient.getAuditLogs(200);
      return (data.logs ?? []) as AuditLogEntry[];
    },
    staleTime: 30_000,
  });

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (riskFilter !== "all") {
      result = result.filter((l) => l.riskLevel === riskFilter);
    }
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.actor.toLowerCase().includes(q) ||
          l.targetType.toLowerCase().includes(q) ||
          (l.detail ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [logs, riskFilter, filterText]);

  if (isError && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="bg-danger/10 mb-4 flex size-14 items-center justify-center rounded-2xl">
          <AlertCircle className="text-danger size-7" />
        </div>
        <p className="text-foreground text-lg font-semibold">加载失败</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {error instanceof Error ? error.message : "未知错误"}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="bg-brand hover:bg-brand/90 mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors"
        >
          <RefreshCw className="size-4" />
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 mb-5 shrink-0">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-hint" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="搜索动作 / 操作者 / 目标类型…"
            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-hint focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
          />
        </div>

        {/* 风险等级筛选 */}
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-hint pointer-events-none" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="appearance-none bg-background border border-border rounded-lg pl-7.5 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors cursor-pointer"
          >
            <option value="all">全部风险</option>
            <option value="low">低风险</option>
            <option value="mid">中风险</option>
            <option value="high">高风险</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-hint pointer-events-none" />
        </div>

        {/* 刷新按钮 */}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", isRefetching && "animate-spin")} />
          刷新
        </button>

        {/* 总数 */}
        <span className="text-hint text-xs ml-auto">
          共 {filteredLogs.length} 条{filteredLogs.length !== logs.length ? ` / ${logs.length}` : ""}
        </span>
      </div>

      {/* 日志列表 */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {isLoading ? (
          <SkeletonList count={8}>
            {() => <div className="h-14 bg-accent/40 rounded-xl animate-pulse" />}
          </SkeletonList>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText className="size-10 text-hint mb-3" />
            <p className="text-muted-foreground text-sm">
              {filterText || riskFilter !== "all" ? "无匹配的审计记录" : "暂无审计日志"}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              className="w-full bg-card border border-border hover:border-brand/20 rounded-xl p-4 text-left transition-all"
            >
              {/* 主行 */}
              <div className="flex items-center gap-3">
                {/* 风险等级标记 */}
                {log.riskLevel && RISK_CONFIG[log.riskLevel] ? (
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                      RISK_CONFIG[log.riskLevel].className,
                    )}
                  >
                    {RISK_CONFIG[log.riskLevel].label}
                  </span>
                ) : (
                  <span className="shrink-0 w-11" />
                )}

                {/* 动作 */}
                <code className="text-foreground text-sm font-mono font-medium shrink-0 min-w-[120px]">
                  {log.action}
                </code>

                {/* 目标类型 + ID */}
                <span className="text-muted-foreground text-xs shrink-0">
                  {log.targetType}
                  <span className="text-hint mx-1">·</span>
                  <span className="text-hint font-mono text-[11px]">{log.targetId.slice(0, 12)}…</span>
                </span>

                <div className="flex-1" />

                {/* 操作者 */}
                <span className="text-muted-foreground text-xs">{log.actor}</span>

                {/* L1-L4 */}
                {log.automationLevel && (
                  <Badge variant="outline" className="text-[10px] text-hint shrink-0">
                    {AUTOMATION_CONFIG[log.automationLevel] ?? log.automationLevel}
                  </Badge>
                )}

                {/* 触发源 */}
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0",
                  log.triggeredBy === "system" ? "bg-brand-blue/10 text-brand-blue" :
                  log.triggeredBy === "cron" ? "bg-warning/10 text-warning" :
                  "bg-accent text-muted-foreground",
                )}>
                  {log.triggeredBy}
                </span>

                {/* 时间 */}
                <span className="text-hint text-[11px] font-mono shrink-0">
                  {formatTime(log.createdAt)}
                </span>

                <ChevronDown
                  className={cn(
                    "size-3.5 text-hint shrink-0 transition-transform",
                    expandedId === log.id && "rotate-180",
                  )}
                />
              </div>

              {/* 展开详情 */}
              {expandedId === log.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {log.detail && (
                    <div>
                      <span className="text-hint text-[10px] font-medium uppercase tracking-wide">详情</span>
                      <p className="text-foreground text-xs mt-0.5 leading-relaxed">{log.detail}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className="text-hint">
                      ID: <span className="text-muted-foreground font-mono">{log.id}</span>
                    </span>
                    <span className="text-hint">
                      状态:{" "}
                      <span className={cn(
                        "font-medium",
                        log.status === "success" ? "text-success" :
                        log.status === "failed" ? "text-danger" :
                        "text-muted-foreground",
                      )}>
                        {log.status}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
