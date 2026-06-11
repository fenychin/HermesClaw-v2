"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Globe, Flag, Zap } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectList,
  SelectItem,
} from "@/components/ui/select";
import { useInquiries } from "@/hooks/use-dashboard-stats";
import { cn } from "@/lib/utils";

// ============================================================
// 常量
// ============================================================

/** 阶段选项（映射到 Inquiry.replied 布尔值）
 *  TODO: "closed" 选项依赖 Inquiry.status 字段（Prisma schema 待迁移）
 *        当前 API 对 stage=closed 不执行过滤，效果等同于 "all"
 */
const STAGE_OPTIONS = [
  { value: "all", label: "全部阶段" },
  { value: "new", label: "新询盘" },
  { value: "replied", label: "已回复" },
  { value: "closed", label: "已关闭" },
] as const;

/** 影响力选项（映射到 MarketIntelligence.impactLevel） */
const IMPACT_OPTIONS = [
  { value: "all", label: "全部影响" },
  { value: "high", label: "高影响" },
  { value: "medium", label: "中影响" },
  { value: "low", label: "低影响" },
] as const;

/** 筛选参数名（URL searchParams keys） */
const PARAM = {
  country: "country",
  stage: "stage",
  impact: "impact",
} as const;

// ============================================================
// 组件
// ============================================================

export function DashboardFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 读取当前 URL 筛选值
  const activeCountry = searchParams.get(PARAM.country) ?? "all";
  const activeStage = searchParams.get(PARAM.stage) ?? "all";
  const activeImpact = searchParams.get(PARAM.impact) ?? "all";

  // 获取所有询盘以提取去重国家列表（用于下拉选项）
  const { allInquiries } = useInquiries();
  const countryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [{ value: "all", label: "全部国家" }];
    for (const inquiry of allInquiries) {
      const code = inquiry.fromCountry;
      if (code && !seen.has(code)) {
        seen.add(code);
        options.push({ value: code, label: `${inquiry.countryFlag} ${code}` });
      }
    }
    return options;
  }, [allInquiries]);

  // 更新单个筛选参数（保留其他参数）
  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // 活跃筛选计数
  const activeCount = [activeCountry, activeStage, activeImpact].filter(
    (v) => v !== "all",
  ).length;

  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* 筛选图标 + 标题 */}
        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
          <Filter className="size-3.5" />
          <span className="text-xs font-medium">筛选</span>
          {activeCount > 0 && (
            <span className="text-[10px] tabular-nums bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
              {activeCount}
            </span>
          )}
        </div>

        {/* 分隔 */}
        <div className="w-px h-5 bg-border shrink-0" />

        {/* 国家筛选 */}
        <Select
          value={activeCountry}
          onValueChange={(v) => setParam(PARAM.country, v ?? "all")}
        >
          <SelectTrigger className="w-auto min-w-[140px]">
            <Globe className="size-3 text-muted-foreground mr-1 shrink-0" />
            <SelectValue placeholder="全部国家" />
          </SelectTrigger>
          <SelectContent>
            <SelectList>
              {countryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectContent>
        </Select>

        {/* 阶段筛选 */}
        <Select
          value={activeStage}
          onValueChange={(v) => setParam(PARAM.stage, v ?? "all")}
        >
          <SelectTrigger className="w-auto min-w-[120px]">
            <Flag className="size-3 text-muted-foreground mr-1 shrink-0" />
            <SelectValue placeholder="全部阶段" />
          </SelectTrigger>
          <SelectContent>
            <SelectList>
              {STAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectContent>
        </Select>

        {/* 影响力筛选 */}
        <Select
          value={activeImpact}
          onValueChange={(v) => setParam(PARAM.impact, v ?? "all")}
        >
          <SelectTrigger className="w-auto min-w-[120px]">
            <Zap className="size-3 text-muted-foreground mr-1 shrink-0" />
            <SelectValue placeholder="全部影响" />
          </SelectTrigger>
          <SelectContent>
            <SelectList>
              {IMPACT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectContent>
        </Select>

        {/* 清除所有筛选 */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => router.replace("/dashboard", { scroll: false })}
            className={cn(
              "text-[10px] text-hint hover:text-muted-foreground transition-colors ml-auto",
              "px-2 py-1 rounded-md hover:bg-accent/50",
            )}
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
