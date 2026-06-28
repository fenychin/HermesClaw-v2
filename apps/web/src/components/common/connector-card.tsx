"use client";

import type { Connector } from "@/types";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";
import { ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

/** 连接器分类中文映射 */
const CATEGORY_LABEL: Record<Connector["category"], string> = {
  email: "邮件",
  im: "即时通讯",
  crm: "CRM",
  erp: "ERP",
  document: "文档",
  data: "数据",
  api: "API",
};

/** 自动化等级中文映射 */
const AUTOMATION_LABEL: Record<string, string> = {
  L1: "L1·自动",
  L2: "L2·半自动",
  L3: "L3·需审批",
  L4: "L4·人工",
};

interface ConnectorCardProps {
  connector: Connector;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * 连接器卡片
 * —— 用于智慧大脑 → 连接器 MCP 页面，展示连接器状态、健康指标与自动化等级
 *
 * 三域归属：OpenClaw Execution Runtime（UI 投影）
 */
export function ConnectorCard({
  connector,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  const isConnected = connector.status === "connected";
  const displayStatus =
    connector.configStatus ||
    (isConnected ? ("connected" as const) : ("idle" as const));

  const successRate = connector.successRate;
  const failureRate = connector.failureRate;
  const autoLevel = connector.requiredAutomationLevel || "L1";
  const isHighRisk = autoLevel === "L3" || autoLevel === "L4";

  return (
    <div className="bg-card border-border rounded-card border p-5 flex flex-col justify-between min-h-[180px] text-left">
      {/* 顶部：iconEmoji + 名称 + category badge */}
      <div>
        <div className="flex items-start gap-3">
          <span
            className="text-3xl leading-none"
            role="img"
            aria-label={connector.name}
          >
            {connector.iconEmoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-foreground truncate text-sm font-semibold">
                {connector.name}
              </h3>
              <span className="bg-accent text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {CATEGORY_LABEL[connector.category]}
              </span>
              {connector.packId && (
                <span className="bg-brand/10 text-brand shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {connector.packId}
                </span>
              )}

              {/* 授权范围小标签 */}
              {connector.authScope && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide",
                    connector.authScope === "readwrite"
                      ? "bg-brand/10 text-brand"
                      : "bg-accent text-hint",
                  )}
                >
                  {connector.authScope === "readwrite" ? "读写" : "只读"}
                </span>
              )}

              {/* 自动化等级 badge */}
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide",
                  isHighRisk
                    ? "bg-danger/10 text-danger"
                    : "bg-success/10 text-success",
                )}
                title={`调用此连接器需要 ${autoLevel} 级别授权`}
              >
                {isHighRisk && (
                  <ShieldAlert className="size-2.5 inline mr-0.5 -mt-px" />
                )}
                {AUTOMATION_LABEL[autoLevel] || autoLevel}
              </span>
            </div>
            {/* 描述：最多两行 */}
            <p className="text-hint mt-1 line-clamp-2 text-xs leading-relaxed">
              {connector.description}
            </p>

            {/* 健康指标行 */}
            <div className="mt-2 flex items-center gap-3 text-[11px]">
              {successRate != null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    successRate >= 95
                      ? "text-success"
                      : successRate >= 80
                        ? "text-warning"
                        : "text-danger",
                  )}
                >
                  <CheckCircle2 className="size-3" />
                  {successRate}%
                </span>
              )}
              {failureRate != null && failureRate > 0 && (
                <span className="text-danger inline-flex items-center gap-1 font-medium">
                  <XCircle className="size-3" />
                  {failureRate}%
                </span>
              )}
              {connector.lastReceiptAt && (
                <span className="text-hint">
                  {formatRelativeTime(connector.lastReceiptAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部：状态 + 操作按钮 */}
      <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
        <StatusBadge status={displayStatus} className="text-[11px]" />
        {isConnected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onDisconnect) onDisconnect();
            }}
            className="text-danger hover:bg-danger/10 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            断开
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onConnect) onConnect();
            }}
            disabled={isHighRisk && connector.status !== "connected"}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              isHighRisk && connector.status !== "connected"
                ? "text-hint cursor-not-allowed"
                : "text-brand hover:bg-brand/10",
            )}
            title={
              isHighRisk && connector.status !== "connected"
                ? `需要 ${autoLevel} 级别审批授权`
                : "连接"
            }
          >
            {isHighRisk && connector.status !== "connected" ? "需审批" : "连接"}
          </button>
        )}
      </div>
    </div>
  );
}

/** 将 ISO 时间戳转化为相对时间 */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
