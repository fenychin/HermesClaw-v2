"use client";

import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** 风险点条目 */
interface RiskPoint {
  title: string;
  level: "high" | "mid" | "low";
  detail?: string;
}

/** 下一步建议条目 */
interface NextAction {
  action: string;
  priority: "urgent" | "normal" | "later";
  detail?: string;
}

interface ProjectRiskPanelProps {
  riskPoints: RiskPoint[];
  nextActions: NextAction[];
  className?: string;
}

/** 风险等级色标 */
function riskLevelClass(level: RiskPoint["level"]) {
  switch (level) {
    case "high":
      return "bg-danger/10 text-danger border-danger/20";
    case "mid":
      return "bg-warning/10 text-warning border-warning/20";
    case "low":
      return "bg-accent text-muted-foreground border-border";
  }
}

function riskLabel(level: RiskPoint["level"]) {
  switch (level) {
    case "high": return "高";
    case "mid": return "中";
    case "low": return "低";
  }
}

function priorityClass(p: NextAction["priority"]) {
  switch (p) {
    case "urgent":
      return "text-danger";
    case "normal":
      return "text-warning";
    case "later":
      return "text-hint";
  }
}

/**
 * 项目风险点与下一步建议面板
 * —— 展示来自 AI 分析的风险评估与建议行动（PRD §10.5）
 */
export function ProjectRiskPanel({
  riskPoints,
  nextActions,
  className,
}: ProjectRiskPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const hasContent = riskPoints.length > 0 || nextActions.length > 0;

  if (!hasContent) {
    return (
      <div className={cn("bg-card border border-border rounded-xl p-4", className)}>
        <p className="text-hint text-xs text-center py-4">
          暂无风险分析数据。启动智能分析后将自动生成风险点与下一步建议。
        </p>
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden", className)}>
      {/* 折叠头 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" />
          <span className="text-foreground text-sm font-semibold">
            风险点与下一步建议
          </span>
          {riskPoints.length > 0 && (
            <span className="text-danger text-[10px] font-medium bg-danger/10 px-1.5 py-0.5 rounded-full">
              {riskPoints.filter((r) => r.level === "high").length > 0
                ? `${riskPoints.filter((r) => r.level === "high").length} 项高危`
                : `${riskPoints.length} 项`}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* 风险点列表 */}
          {riskPoints.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                风险点
              </h4>
              <div className="space-y-1.5">
                {riskPoints.map((rp, i) => (
                  <div
                    key={i}
                    className={cn(
                      "border rounded-lg px-3 py-2 text-xs",
                      riskLevelClass(rp.level)
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{rp.title}</span>
                      <span className="text-[10px] shrink-0 opacity-70">
                        {riskLabel(rp.level)}风险
                      </span>
                    </div>
                    {rp.detail && (
                      <p className="text-[11px] mt-1 opacity-80 leading-relaxed">
                        {rp.detail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 下一步建议 */}
          {nextActions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                下一步建议
              </h4>
              <div className="space-y-1.5">
                {nextActions.map((na, i) => (
                  <div
                    key={i}
                    className="bg-accent/40 border border-border rounded-lg px-3 py-2 flex items-start gap-2"
                  >
                    <ArrowRight
                      className={cn("size-3.5 mt-0.5 shrink-0", priorityClass(na.priority))}
                    />
                    <div className="min-w-0">
                      <span className="text-foreground text-xs font-medium">
                        {na.action}
                      </span>
                      {na.detail && (
                        <p className="text-hint text-[11px] mt-0.5 leading-relaxed">
                          {na.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
