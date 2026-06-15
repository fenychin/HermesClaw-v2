"use client";

import { Users, TrendingUp } from "lucide-react";
import { RelativeTime } from "@/components/common/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActiveClientAlert } from "@/hooks/use-dashboard-stats";

interface ActiveClientAlertsProps {
  alerts: ActiveClientAlert[];
  isLoading: boolean;
}

/**
 * 客户活跃预警卡片
 * —— 展示近 7 天高频询盘客户（≥2 条），warning 色标记高优先级
 * —— PRD §10.3：正向活跃监测，补全沉默预警的另一面
 */
export function ActiveClientAlerts({
  alerts,
  isLoading,
}: ActiveClientAlertsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <p className="text-hint text-xs flex items-center gap-1.5">
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground" />
        暂无高频活跃客户
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {alerts.map((alert) => (
        <div
          key={alert.companyName}
          className="flex items-center justify-between gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="size-3.5 text-warning shrink-0" />
            <span className="text-foreground text-xs font-medium truncate">
              <span className="mr-1">{alert.countryFlag}</span>
              {alert.companyName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-warning text-xs tabular-nums">
              近7天 {alert.recentCount} 条
            </span>
            <span className="text-hint text-[10px] tabular-nums">
              <RelativeTime
                value={alert.lastInquiryAt}
                className="text-hint text-[10px]"
              />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 活跃客户预警区块（独立卡片）
 * —— 内嵌于页面中，展示活跃客户 + 沉默预警互补
 */
export function ActiveClientSection({
  alerts,
  isLoading,
}: ActiveClientAlertsProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="size-4 text-warning" />
        <h3 className="text-foreground font-semibold text-sm">
          客户活跃预警
        </h3>
        {!isLoading && alerts.length > 0 && (
          <span className="text-[10px] tabular-nums bg-warning/10 text-warning px-1.5 py-0.5 rounded-full font-semibold">
            {alerts.length}
          </span>
        )}
      </div>
      <ActiveClientAlerts alerts={alerts} isLoading={isLoading} />
    </div>
  );
}
