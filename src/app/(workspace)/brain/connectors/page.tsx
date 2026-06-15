"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plug,
  Search,
  X,
  Link2,
  Link2Off,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { ConnectorCard } from "@/components/common/connector-card";
import { StatusBadge } from "@/components/common/status-badge";
import { useAgentStore } from "@/stores/agent-store";
import { useConnectorStore } from "@/stores/connector-store";
import type { Connector, ConnectorCategory } from "@/types";
import { cn } from "@/lib/utils";

/** 分类中文映射 */
const CATEGORY_LABEL: Record<ConnectorCategory | "all", string> = {
  all: "全部",
  email: "邮件",
  im: "IM",
  crm: "CRM",
  erp: "ERP",
  document: "文档",
  data: "数据",
  api: "API",
};

const ALL_CATEGORIES: (ConnectorCategory | "all")[] = [
  "all",
  "email",
  "im",
  "crm",
  "erp",
  "document",
  "data",
  "api",
];

/** 格式化日期时间 */
function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${mm}月${dd}日 ${hh}:${min}`;
}

/** 连接器详情 Drawer */
function ConnectorDrawer({
  connector,
  onClose,
  onToggle,
}: {
  connector: Connector;
  onClose: () => void;
  onToggle: (id: string, next: "connected" | "available") => void;
}) {
  const router = useRouter();
  const storeAgents = useAgentStore((s) => s.agents);
  const linkedAgents = useMemo(
    () => storeAgents.filter((a) => connector.usedByAgents.includes(a.id)),
    [connector, storeAgents],
  );

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* 滑出面板 */}
      <div className="bg-sidebar border-border fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l shadow-2xl animate-in slide-in-from-right duration-200">
        {/* 顶部 */}
        <div className="border-border flex items-start justify-between border-b p-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl" role="img" aria-label={connector.name}>
              {connector.iconEmoji}
            </span>
            <div>
              <h2 className="text-foreground text-base font-semibold">
                {connector.name}
              </h2>
              <p className="text-hint text-xs">
                {CATEGORY_LABEL[connector.category]} 连接器
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-left">
          {/* 状态 */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">状态</span>
            <div className="flex items-center gap-1.5">
              {connector.configStatus === "pending_config" ? (
                <span className="inline-flex items-center gap-1 bg-warning/10 text-warning px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  <span className="size-1.5 rounded-full bg-warning" />
                  待配置
                </span>
              ) : connector.configStatus === "error" ? (
                <span className="inline-flex items-center gap-1 bg-danger/10 text-danger px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  <span className="size-1.5 rounded-full bg-danger animate-pulse" />
                  连接异常 {connector.failureCount && connector.failureCount > 0 ? `(失败 ${connector.failureCount} 次)` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-success/10 text-success px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  <span className="size-1.5 rounded-full bg-success" />
                  已连接
                </span>
              )}
            </div>
          </div>

          {/* 描述 */}
          <div>
            <h3 className="text-foreground mb-1.5 text-xs font-semibold uppercase tracking-wide">
              描述
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {connector.description}
            </p>
          </div>

          {/* 权限列表 */}
          <div>
            <h3 className="text-foreground mb-1.5 text-xs font-semibold uppercase tracking-wide">
              权限范围
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {connector.permissions.map((perm) => (
                <span
                  key={perm}
                  className="bg-accent text-muted-foreground rounded-md px-2.5 py-1 text-xs"
                >
                  {perm}
                </span>
              ))}
            </div>
          </div>

          {/* 数据授权范围 */}
          <div>
            <h3 className="text-foreground mb-1.5 text-xs font-semibold uppercase tracking-wide">
              数据授权范围
            </h3>
            <span className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-lg inline-block",
              connector.authScope === "readwrite"
                ? "bg-brand/10 text-brand"
                : "bg-accent text-muted-foreground"
            )}>
              {connector.authScope === "readwrite" ? "双向读写授权" : "仅读取授权 (只读)"}
            </span>
          </div>

          {/* 关联智能体 */}
          {linkedAgents.length > 0 && (
            <div>
              <h3 className="text-foreground mb-1.5 text-xs font-semibold uppercase tracking-wide">
                关联智能体
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {linkedAgents.map((agent) => (
                  <span
                    key={agent.id}
                    className="bg-brand/10 text-brand rounded-md px-2.5 py-1 text-xs font-medium"
                  >
                    {agent.name} · {agent.role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 最近同步 */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">最近调用时间</span>
            <span className="text-foreground flex items-center gap-1.5 text-sm">
              <Clock className="text-hint size-3.5" />
              {formatDate(connector.lastSync)}
            </span>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="border-border border-t p-5 space-y-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/settings?section=connectors");
            }}
            className="w-full bg-accent hover:bg-accent/80 text-foreground inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            前往设置页配置授权
          </button>

          {connector.status === "connected" ? (
            <button
              type="button"
              onClick={() => onToggle(connector.id, "available")}
              className="border-danger text-danger hover:bg-danger/10 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <Link2Off className="size-4" />
              断开连接
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggle(connector.id, "connected")}
              className="bg-brand text-white hover:bg-brand/80 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <Link2 className="size-4" />
              连接
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** 智慧大脑 → 连接器 MCP 页 */
export default function ConnectorsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | "all">("all");
  const [showConnected, setShowConnected] = useState(false);
  const [drawerConnector, setDrawerConnector] = useState<Connector | null>(null);

  const loadAgents = useAgentStore((s) => s.loadAgents);
  const connectors = useConnectorStore((s) => s.connectors);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);
  const setStatus = useConnectorStore((s) => s.setStatus);
  useEffect(() => {
    loadAgents();
    loadConnectors();
  }, [loadAgents, loadConnectors]);

  // 连接/断开后同步本地 Drawer 选中态，保持按钮即时反馈
  const handleToggle = (id: string, next: "connected" | "available") => {
    setStatus(id, next);
    setDrawerConnector((prev) =>
      prev && prev.id === id ? { ...prev, status: next } : prev,
    );
  };

  const filtered = useMemo(() => {
    let list = [...connectors];

    // 分类筛选
    if (activeCategory !== "all") {
      list = list.filter((c) => c.category === activeCategory);
    }

    // 状态筛选
    if (showConnected) {
      list = list.filter((c) => c.status === "connected");
    }

    // 搜索
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }

    return list;
  }, [connectors, activeCategory, showConnected, search]);

  return (
    <PageTransition>
    <div className="space-y-6">
      <PageHeader
        title="连接器"
        description="邮件、IM、CRM、ERP、文档与 API 的统一接入授权管理"
      />

      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between gap-4">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-md">
          <Search className="text-hint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索连接器…"
            className="bg-card border-border text-foreground placeholder:text-hint w-full rounded-xl border py-2 pl-9 pr-4 text-sm outline-none transition-colors focus:border-brand/50"
          />
        </div>

        {/* 分类标签 */}
        <div className="flex gap-1.5">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === cat
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        {/* 已连接切换 */}
        <button
          type="button"
          onClick={() => setShowConnected(!showConnected)}
          className={cn(
            "border-border inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            showConnected
              ? "bg-success/10 text-success border-success/30"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {showConnected ? "已连接" : "可用"}
        </button>
      </div>

      {/* 卡片网格 */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="未找到匹配的连接器"
          description="尝试调整分类筛选或输入其他搜索词"
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((connector) => (
            <div
              key={connector.id}
              onClick={() => setDrawerConnector(connector)}
              className="cursor-pointer"
            >
              <ConnectorCard connector={connector} />
            </div>
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerConnector && (
        <ConnectorDrawer
          connector={drawerConnector}
          onClose={() => setDrawerConnector(null)}
          onToggle={handleToggle}
        />
      )}
    </div>
  </PageTransition>
  );
}
