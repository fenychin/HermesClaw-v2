"use client";

import type { Connector } from "@/types";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

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

interface ConnectorCardProps {
  connector: Connector;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * 连接器卡片
 * —— 用于智慧大脑 → 连接器 MCP 页面，展示连接器状态与操作
 */
export function ConnectorCard({
  connector,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  const isConnected = connector.status === "connected";
  const displayStatus = connector.configStatus || (isConnected ? ("connected" as const) : ("idle" as const));

  return (
    <div className="bg-card border-border rounded-card border p-5 flex flex-col justify-between min-h-[160px] text-left">
      {/* 顶部：iconEmoji + 名称 + category badge */}
      <div>
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none" role="img" aria-label={connector.name}>
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
                <span className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide",
                  connector.authScope === "readwrite"
                    ? "bg-brand/10 text-brand"
                    : "bg-accent text-hint"
                )}>
                  {connector.authScope === "readwrite" ? "读写" : "只读"}
                </span>
              )}
            </div>
            {/* 描述：最多两行 */}
            <p className="text-hint mt-1 line-clamp-2 text-xs leading-relaxed">
              {connector.description}
            </p>
          </div>
        </div>
      </div>

      {/* 底部：状态 + 操作按钮 */}
      <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
        <StatusBadge
          status={displayStatus}
          className="text-[11px]"
        />
        {isConnected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // 阻止卡片点击触发 Drawer
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
              e.stopPropagation(); // 阻止卡片点击触发 Drawer
              if (onConnect) onConnect();
            }}
            className="text-brand hover:bg-brand/10 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            连接
          </button>
        )}
      </div>
    </div>
  );
}
