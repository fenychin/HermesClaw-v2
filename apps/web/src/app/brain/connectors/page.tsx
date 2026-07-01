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
  Plus,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RotateCcw,
  FileCheck,
  ReceiptText,
  Info,
  ExternalLink,
  Copy,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { ConnectorCard, ConnectorIcon } from "@/components/common/connector-card";
import { useAgentStore } from "@/stores/agent-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ConfirmationRequiredError } from "@/lib/api-client";
import { toast } from "sonner";
import type {
  Connector,
  ConnectorHealth,
  ConnectorCategory,
  ConnectorSelfCheck,
  ActionReceipt,
  ConnectorLease,
} from "@/types";
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

/** 自动化等级中文 */
const AUTOMATION_LABEL: Record<string, string> = {
  L1: "L1 — 全自动，无需审批",
  L2: "L2 — 半自动，低风险操作",
  L3: "L3 — 需审批，高风险操作",
  L4: "L4 — 人工执行，禁止自动",
};

/** 复制到剪贴板 */
async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} 已复制`);
  } catch {
    // fallback for older browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast.success(`${label} 已复制`);
  }
}

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

/** 相对时间 */
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

/** 连接器详情 Drawer */
function ConnectorDrawer({
  connector,
  onClose,
  onToggle,
  onDelete,
  isDeleting,
  canDelete,
}: {
  connector: Connector;
  onClose: () => void;
  onToggle: (id: string, next: "connected" | "available") => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "overview" | "config" | "bindings" | "logs" | "harness" | "receipts"
  >("overview");
  const [checkStatus, setCheckStatus] = useState<ConnectorSelfCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [showApprovalGuide, setShowApprovalGuide] = useState(false);

  const { data: usageData } = useQuery({
    queryKey: ["connector-usage", connector.id],
    queryFn: () => apiClient.getConnectorUsage(connector.id),
    enabled: activeTab === "logs" || activeTab === "overview",
    refetchInterval: 30_000,
  });

  // 回执数据
  const { data: receiptsData } = useQuery({
    queryKey: ["connector-receipts", connector.id],
    queryFn: () => apiClient.getConnectorReceipts(connector.id),
    enabled: activeTab === "receipts" || activeTab === "overview",
    refetchInterval: 30_000,
  });
  const receipts: ActionReceipt[] = (receiptsData?.receipts || []) as ActionReceipt[];

  // 租约数据
  const { data: leaseData, refetch: refetchLease } = useQuery({
    queryKey: ["connector-lease", connector.id],
    queryFn: () => apiClient.getConnectorLease(connector.id),
    enabled: activeTab === "harness" || activeTab === "overview",
    refetchInterval: 30_000,
  });
  const activeLease: ConnectorLease | null = (leaseData?.lease || null) as ConnectorLease | null;

  // 租约历史
  const { data: leaseHistoryData } = useQuery({
    queryKey: ["connector-lease-history", connector.id],
    queryFn: () => apiClient.getConnectorLeaseHistory(connector.id, 5),
    enabled: activeTab === "harness",
  });
  const leaseHistory: ConnectorLease[] = (leaseHistoryData?.leases || []) as ConnectorLease[];

  const queryClient = useQueryClient();

  // 申请租约 mutation
  const acquireLeaseMut = useMutation({
    mutationFn: (params: { scope?: string[]; maxRiskLevel?: string; ttlMinutes?: number; confirm?: boolean }) =>
      apiClient.acquireConnectorLease(connector.id, params),
    onSuccess: () => {
      toast.success("租约申请成功");
      queryClient.invalidateQueries({ queryKey: ["connector-lease", connector.id] });
      queryClient.invalidateQueries({ queryKey: ["connector-lease-history", connector.id] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "租约申请失败");
    },
  });

  // 吊销租约 mutation
  const revokeLeaseMut = useMutation({
    mutationFn: (leaseId?: string) => apiClient.revokeConnectorLease(connector.id, leaseId),
    onSuccess: () => {
      toast.success("租约已吊销");
      queryClient.invalidateQueries({ queryKey: ["connector-lease", connector.id] });
      queryClient.invalidateQueries({ queryKey: ["connector-lease-history", connector.id] });
      refetchLease();
    },
    onError: (err: any) => {
      toast.error(err?.message || "吊销租约失败");
    },
  });

  const storeAgents = useAgentStore((s) => s.agents);
  const linkedAgents = useMemo(() => {
    if (!connector || !connector.usedByAgents) return [];
    let list: string[] = [];
    if (Array.isArray(connector.usedByAgents)) list = connector.usedByAgents;
    else if (typeof connector.usedByAgents === "string") {
      try {
        list = JSON.parse(connector.usedByAgents);
      } catch {
        list = [];
      }
    }
    return storeAgents.filter((a) => list.includes(a.id));
  }, [connector, storeAgents]);

  const healthLabel: Record<ConnectorHealth | "unknown", string> = {
    active: "健康",
    degraded: "降级",
    disabled: "已禁用",
    error: "异常",
    unknown: "未知",
  };
  const healthColorClass = (h?: ConnectorHealth) => {
    if (h === "active") return "bg-success";
    if (h === "degraded") return "bg-warning";
    if (h === "disabled") return "bg-muted-foreground";
    if (h === "error") return "bg-danger";
    return "bg-muted-foreground";
  };

  const autoLevel = connector.requiredAutomationLevel || "L1";
  const isHighRisk = autoLevel === "L3" || autoLevel === "L4";
  const successRate = connector.successRate;
  const failureRate = connector.failureRate;

  const runSelfCheck = async () => {
    const items: ConnectorSelfCheck[] = [
      { label: "凭证有效性", key: "credential", status: "running" },
      { label: "网络可达性", key: "network", status: "pending" },
      { label: "模板完整性", key: "template", status: "pending" },
      { label: "回执正确性", key: "receipt", status: "pending" },
      { label: "权限校验", key: "permission", status: "pending" },
    ];
    setCheckStatus(items);
    setChecking(true);
    try {
      const res = await apiClient.selfCheckConnector(connector.id);
      if (res && res.checks) {
        setCheckStatus(res.checks as ConnectorSelfCheck[]);
      } else {
        setCheckStatus(items.map((it) => ({ ...it, status: "pass" as const })));
      }
    } catch {
      setCheckStatus(
        items.map((it) => ({ ...it, status: "fail" as const, detail: "检测超时" })),
      );
    }
    setChecking(false);
  };

  const TABS = [
    { key: "overview", label: "概览" },
    { key: "receipts", label: "回执" },
    { key: "config", label: "配置" },
    { key: "bindings", label: "绑定" },
    { key: "logs", label: "日志" },
    { key: "harness", label: "Harness" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="bg-sidebar border-border fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col border-l shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="border-border flex items-start justify-between border-b p-5 shrink-0">
          <div className="flex items-center gap-3">
            <ConnectorIcon name={connector.name} emoji={connector.iconEmoji || "🔌"} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-base font-semibold">
                  {connector.name}
                </h2>
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    healthColorClass(connector.health),
                  )}
                />
                {isHighRisk && (
                  <span className="bg-danger/10 text-danger inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    <ShieldAlert className="size-2.5" />
                    需审批
                  </span>
                )}
              </div>
              <p className="text-hint text-xs">
                {CATEGORY_LABEL[connector.category] || connector.category} ·{" "}
                {connector.source === "builtin"
                  ? "系统内置"
                  : connector.source === "industry-pack"
                    ? "行业包"
                    : "自定义"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-border flex border-b shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px",
                activeTab === tab.key
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.key === "receipts" && (
                <ReceiptText className="size-3 inline mr-1 -mt-px" />
              )}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {/* 健康指标网格 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">状态</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold",
                      connector.status === "connected"
                        ? "text-success"
                        : connector.status === "error"
                          ? "text-danger"
                          : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        connector.status === "connected"
                          ? "bg-success"
                          : connector.status === "error"
                            ? "bg-danger animate-pulse"
                            : "bg-muted-foreground",
                      )}
                    />
                    {connector.status === "connected"
                      ? "已连接"
                      : connector.status === "available"
                        ? "可用"
                        : connector.status === "error"
                          ? "异常"
                          : connector.status}
                  </span>
                </div>
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">健康</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold",
                      connector.health === "active"
                        ? "text-success"
                        : connector.health === "degraded"
                          ? "text-warning"
                          : connector.health === "error"
                            ? "text-danger"
                            : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        healthColorClass(connector.health),
                      )}
                    />
                    {healthLabel[connector.health || "unknown"] || "未知"}
                  </span>
                </div>

                {/* 成功率 */}
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">成功率</p>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      successRate != null
                        ? successRate >= 95
                          ? "text-success"
                          : successRate >= 80
                            ? "text-warning"
                            : "text-danger"
                        : "text-hint",
                    )}
                  >
                    {successRate != null ? `${successRate}%` : "—"}
                  </span>
                </div>

                {/* 失败率 */}
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">失败率</p>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      failureRate != null && failureRate > 0
                        ? "text-danger"
                        : "text-success",
                    )}
                  >
                    {failureRate != null
                      ? `${failureRate}%`
                      : connector.totalCalls != null && connector.totalCalls > 0
                        ? "0%"
                        : "—"}
                  </span>
                </div>

                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">总调用</p>
                  <p className="text-foreground text-xs font-bold">
                    {connector.totalCalls ?? "—"}
                  </p>
                </div>
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">上次回执</p>
                  <p className="text-foreground text-xs font-medium">
                    {connector.lastReceiptAt
                      ? formatRelativeTime(connector.lastReceiptAt)
                      : "—"}
                  </p>
                </div>

                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">自动化等级</p>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isHighRisk ? "text-danger" : "text-success",
                    )}
                  >
                    {autoLevel}
                    {isHighRisk && " ⚠"}
                  </span>
                </div>
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">租用状态</p>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      connector.leaseStatus === "active"
                        ? "text-success"
                        : connector.leaseStatus === "expired"
                          ? "text-warning"
                          : connector.leaseStatus === "revoked"
                            ? "text-danger"
                            : "text-hint",
                    )}
                  >
                    {connector.leaseStatus === "active"
                      ? "已授权"
                      : connector.leaseStatus === "expired"
                        ? "已过期"
                        : connector.leaseStatus === "revoked"
                          ? "已撤销"
                          : "未租用"}
                  </span>
                  {activeLease && (
                    <p className="text-hint text-[10px] mt-1">
                      过期: {formatDate(activeLease.expiresAt)} · 作用域: {activeLease.scope?.join(", ") || "—"}
                    </p>
                  )}
                </div>

                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">版本</p>
                  <p className="text-foreground text-xs font-medium">
                    {connector.version || "—"}
                  </p>
                </div>
                <div className="bg-card rounded-xl border border-border p-3">
                  <p className="text-hint text-xs mb-1">数据授权</p>
                  <p
                    className={cn(
                      "text-xs font-semibold",
                      connector.authScope === "readwrite"
                        ? "text-brand"
                        : "text-muted-foreground",
                    )}
                  >
                    {connector.authScope === "readwrite" ? "双向读写" : "仅读取"}
                  </p>
                </div>
              </div>

              {/* 用量快照（24h） */}
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                  用量快照（24h）
                </h3>
                {usageData ? (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-foreground text-lg font-bold">
                        {usageData.totalCalls24h}
                      </p>
                      <p className="text-hint text-xs">调用次数</p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-lg font-bold",
                          usageData.successRate24h >= 95
                            ? "text-success"
                            : usageData.successRate24h >= 80
                              ? "text-warning"
                              : "text-danger",
                        )}
                      >
                        {usageData.successRate24h}%
                      </p>
                      <p className="text-hint text-xs">成功率</p>
                    </div>
                    <div>
                      <p className="text-foreground text-lg font-bold">
                        {usageData.avgLatencyMs24h}ms
                      </p>
                      <p className="text-hint text-xs">平均延迟</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-hint text-xs">加载中…</div>
                )}
              </div>

              {/* 最近回执摘要 */}
              {receipts.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    最近回执（{receipts.length}）
                  </h3>
                  <div className="space-y-2">
                    {receipts.slice(0, 5).map((r) => (
                      <button
                        key={r.receiptId}
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            r.receiptHash || r.receiptId,
                            "回执 Hash",
                          )
                        }
                        className="flex items-center justify-between py-1 w-full text-left hover:bg-brand/5 rounded px-1 -ml-1 transition-colors cursor-pointer group"
                        title="点击复制回执 Hash"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "size-1.5 rounded-full shrink-0",
                              r.outcome === "success"
                                ? "bg-success"
                                : "bg-danger",
                            )}
                          />
                          <code className="text-hint text-[10px] truncate group-hover:text-brand transition-colors">
                            {r.receiptHash?.slice(0, 8) || r.receiptId}
                          </code>
                          <Copy className="size-2.5 text-hint opacity-0 group-hover:opacity-50 shrink-0" />
                        </div>
                        <span className="text-hint text-[10px] shrink-0">
                          {formatRelativeTime(r.executedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {usageData?.lastTestResult && (
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    最近测试结果
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          usageData.lastTestResult.success
                            ? "bg-success"
                            : "bg-danger",
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          usageData.lastTestResult.success
                            ? "text-success"
                            : "text-danger",
                        )}
                      >
                        {usageData.lastTestResult.success ? "通过" : "失败"}
                      </span>
                    </div>
                    <span className="text-hint text-xs">
                      {usageData.lastTestResult.latencyMs}ms ·{" "}
                      {formatDate(usageData.lastTestResult.timestamp)}
                    </span>
                  </div>
                  {usageData.lastTestResult.error && (
                    <p className="text-danger text-xs mt-2">
                      {usageData.lastTestResult.error}
                    </p>
                  )}
                </div>
              )}
              {usageData?.lastError && (
                <div className="bg-danger/5 rounded-xl border border-danger/20 p-4">
                  <h3 className="text-danger text-xs font-semibold uppercase tracking-wide mb-2">
                    最近错误
                  </h3>
                  <p className="text-danger/80 text-sm">
                    {usageData.lastError.message}
                  </p>
                  <p className="text-hint text-xs mt-1">
                    {formatDate(usageData.lastError.timestamp)}
                  </p>
                </div>
              )}
              {usageData?.lastSuccessAt && (
                <div className="text-hint text-xs">
                  最后成功时间：{formatDate(usageData.lastSuccessAt)}
                </div>
              )}

              {/* 自检 */}
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
                    发布前自检
                  </h3>
                  <button
                    onClick={runSelfCheck}
                    disabled={checking}
                    className="bg-brand text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-brand/80 disabled:opacity-50 transition-colors"
                  >
                    {checking
                      ? "检测中…"
                      : checkStatus.length > 0
                        ? "重新检测"
                        : "开始检测"}
                  </button>
                </div>
                {checkStatus.length > 0 ? (
                  <div className="space-y-1.5">
                    {checkStatus.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-accent/30"
                      >
                        <span className="text-foreground text-xs">
                          {item.label}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            item.status === "pass"
                              ? "text-success"
                              : item.status === "fail"
                                ? "text-danger"
                                : item.status === "running"
                                  ? "text-brand animate-pulse"
                                  : "text-hint",
                          )}
                        >
                          {item.status === "pass"
                            ? "✓ 通过"
                            : item.status === "fail"
                              ? "✗ 失败"
                              : item.status === "running"
                                ? "检测中"
                                : "待检测"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-hint text-xs">
                    点击上方按钮开始逐项校验凭证、网络、模板、回执、权限
                  </p>
                )}
              </div>
            </>
          )}

          {/* RECEIPTS — 回执列表 */}
          {activeTab === "receipts" && (
            <div className="space-y-4">
              <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
                执行回执（最近 10 条）
              </h3>
              {receipts.length > 0 ? (
                <div className="space-y-2">
                  {receipts.map((r) => (
                    <div
                      key={r.receiptId}
                      className="bg-card rounded-xl border border-border p-4"
                    >
                      {/* 顶部行：状态 + hash（可复制） */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              r.outcome === "success"
                                ? "bg-success"
                                : "bg-danger",
                            )}
                          />
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              r.outcome === "success"
                                ? "text-success"
                                : "text-danger",
                            )}
                          >
                            {r.outcome === "success" ? "成功" : "失败"}
                          </span>
                          {r.retryable && (
                            <span className="bg-warning/10 text-warning rounded-full px-1.5 py-0.5 text-[9px] font-medium">
                              <RotateCcw className="size-2.5 inline mr-0.5" />
                              可重试
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              r.receiptHash || r.receiptId,
                              "回执 Hash",
                            );
                          }}
                          className="text-hint hover:text-brand hover:bg-brand/5 inline-flex items-center gap-1 text-[10px] font-mono rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                          title="点击复制完整 Hash"
                        >
                          {r.receiptHash?.slice(0, 8) || r.receiptId.slice(0, 8)}
                          <Copy className="size-2.5 opacity-50" />
                        </button>
                      </div>

                      {/* 中间行：taskId + workflowRunId（可点击复制） */}
                      <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(r.taskId, "taskId");
                          }}
                          className="text-left hover:bg-brand/5 rounded px-1 -ml-1 transition-colors cursor-pointer group"
                          title="点击复制完整 taskId"
                        >
                          <span className="text-hint">taskId: </span>
                          <code className="text-muted-foreground font-mono group-hover:text-brand transition-colors">
                            {r.taskId.slice(0, 12)}…
                          </code>
                          <Copy className="size-2.5 text-hint opacity-0 group-hover:opacity-50 inline ml-0.5 -mt-px" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(r.workflowRunId, "workflowRunId");
                          }}
                          className="text-left hover:bg-brand/5 rounded px-1 -ml-1 transition-colors cursor-pointer group"
                          title="点击复制完整 workflowRunId"
                        >
                          <span className="text-hint">workflowRunId: </span>
                          <code className="text-muted-foreground font-mono group-hover:text-brand transition-colors">
                            {r.workflowRunId.slice(0, 12)}…
                          </code>
                          <Copy className="size-2.5 text-hint opacity-0 group-hover:opacity-50 inline ml-0.5 -mt-px" />
                        </button>
                      </div>

                      {/* 失败原因 */}
                      {r.outcome === "failure" && (
                        <div className="bg-danger/5 border border-danger/20 rounded-lg p-2.5 mb-2">
                          <p className="text-danger text-xs font-medium">
                            {r.failureReason || r.errorCode || "执行失败（无详细信息）"}
                          </p>
                        </div>
                      )}

                      {/* 底部行：时间 + 耗时 */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-hint">
                          {formatDate(r.executedAt)}
                        </span>
                        <span className="text-hint">
                          {r.durationMs != null ? `${r.durationMs}ms` : ""}
                          {r.compensationStrategy
                            ? ` · 补偿: ${r.compensationStrategy}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileCheck}
                  title="暂无回执"
                  description="此连接器尚无执行回执记录，执行操作后将自动生成"
                />
              )}
            </div>
          )}

          {/* CONFIG */}
          {activeTab === "config" && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                    描述
                  </label>
                  <p className="text-muted-foreground text-sm">
                    {connector.description || "无描述"}
                  </p>
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                    权限范围
                  </label>
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
                <div>
                  <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                    连接器 ID
                  </label>
                  <code className="text-hint text-xs bg-accent rounded px-2 py-1 select-all">
                    {connector.id}
                  </code>
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                    行业包
                  </label>
                  <p className="text-muted-foreground text-sm">
                    {connector.packId || "无关联"}
                  </p>
                </div>
                <div>
                  <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                    最后同步
                  </label>
                  <p className="text-muted-foreground text-sm flex items-center gap-1.5">
                    <Clock className="size-3" />
                    {formatDate(connector.lastSync)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  router.push("/settings?section=connectors");
                }}
                className="w-full bg-accent hover:bg-accent/80 text-foreground rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors mt-4"
              >
                前往设置页配置授权
              </button>
            </>
          )}

          {/* BINDINGS */}
          {activeTab === "bindings" && (
            <div className="space-y-4">
              <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
                关联智能体
              </h3>
              {linkedAgents.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {linkedAgents.map((agent) => (
                    <span
                      key={agent.id}
                      className="bg-brand/10 text-brand rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-brand/20"
                      onClick={() => {
                        onClose();
                        router.push("/brain/agents");
                      }}
                    >
                      {agent.name} · {agent.role}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Plug}
                  title="无关联智能体"
                  description="此连接器暂未绑定任何智能体"
                />
              )}
            </div>
          )}

          {/* LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-3">
              <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
                最近事件（20 条）
              </h3>
              {usageData?.recentEvents && usageData.recentEvents.length > 0 ? (
                <div className="space-y-2">
                  {usageData.recentEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="bg-card rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-foreground text-xs font-medium">
                          {evt.action}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            evt.status === "success"
                              ? "text-success"
                              : evt.status === "failed"
                                ? "text-danger"
                                : "text-warning",
                          )}
                        >
                          {evt.status}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs mt-1">
                        {evt.detail}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-hint text-xs">
                          {formatDate(evt.timestamp)}
                        </span>
                        {evt.latencyMs != null && (
                          <span className="text-hint text-xs">
                            {evt.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Clock}
                  title="暂无日志"
                  description="连接器暂无执行记录"
                />
              )}
            </div>
          )}

          {/* HARNESS — 更新为真实治理信息 */}
          {activeTab === "harness" && (
            <div className="space-y-4">
              <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">
                Harness 治理信息
              </h3>
              <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">自动化等级</span>
                  <span
                    className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      isHighRisk
                        ? "bg-danger/10 text-danger"
                        : "bg-success/10 text-success",
                    )}
                  >
                    {AUTOMATION_LABEL[autoLevel] || autoLevel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">调用门槛</span>
                  <span className="text-xs text-muted-foreground">
                    {isHighRisk
                      ? "需要 leaseToken + 审批通过方可调用"
                      : "L1/L2 任务可直接调用"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">租用状态</span>
                  <span
                    className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      connector.leaseStatus === "active"
                        ? "bg-success/10 text-success"
                        : connector.leaseStatus === "expired"
                          ? "bg-warning/10 text-warning"
                          : "bg-accent text-muted-foreground",
                    )}
                  >
                    {connector.leaseStatus === "active"
                      ? "活跃"
                      : connector.leaseStatus === "expired"
                        ? "已过期"
                        : connector.leaseStatus === "revoked"
                          ? "已撤销"
                          : "未租用"}
                  </span>
                </div>
                {/* 真实租约详情（当有活跃租约时展示） */}
                {activeLease && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground text-sm">租约 ID</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {activeLease.leaseId.slice(0, 16)}…
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground text-sm">过期时间</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(activeLease.expiresAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground text-sm">作用域</span>
                      <span className="text-xs text-muted-foreground">
                        {activeLease.scope?.join(", ") || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground text-sm">最大风险等级</span>
                      <span className="text-xs font-semibold">{activeLease.maxRiskLevel}</span>
                    </div>
                  </>
                )}
                {/* 租约历史（最近 5 条） */}
                {leaseHistory.length > 0 && (
                  <div className="border-t border-border pt-3 mt-2">
                    <span className="text-foreground text-xs font-semibold">租约历史</span>
                    <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                      {leaseHistory.map((l) => (
                        <div key={l.leaseId} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-mono">{l.leaseId.slice(0, 12)}…</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full font-semibold",
                            l.status === "active" ? "bg-success/10 text-success" :
                            l.status === "expired" ? "bg-warning/10 text-warning" :
                            "bg-danger/10 text-danger"
                          )}>
                            {l.status === "active" ? "活跃" : l.status === "expired" ? "已过期" : "已撤销"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">内置保护</span>
                  <span className="text-xs font-semibold">
                    {connector.source === "builtin"
                      ? "✓ 只读，不可删除"
                      : "— 无限制"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">绑定智能体数</span>
                  <span className="text-xs font-semibold">
                    {linkedAgents.length} 个
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">风险等级</span>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isHighRisk ? "text-danger" : "text-success",
                    )}
                  >
                    {isHighRisk
                      ? "高 — 写操作/外发，需审批"
                      : "低 — 读操作为主"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm">最后心跳</span>
                  <span className="text-xs text-muted-foreground">
                    {connector.lastHeartbeatAt
                      ? formatDate(connector.lastHeartbeatAt)
                      : "—"}
                  </span>
                </div>
              </div>

              {/* 租约操作按钮 */}
              <div className="space-y-2">
                {!activeLease || activeLease.status !== "active" ? (
                  <button
                    onClick={() => {
                      const scope = isHighRisk ? ["read"] : ["read", "send"];
                      const maxRiskLevel = isHighRisk ? "medium" : "low";
                      // confirm 基于 scope 是否含写操作（与 API hasWriteScope 一致），而非 isHighRisk
                      const hasWrite = scope.some((s) =>
                        ["write", "send", "create", "modify", "delete"].includes(s.toLowerCase()),
                      );
                      acquireLeaseMut.mutate({
                        scope,
                        maxRiskLevel,
                        ttlMinutes: 60,
                        confirm: hasWrite,
                      });
                    }}
                    disabled={acquireLeaseMut.isPending}
                    className="bg-brand text-white hover:bg-brand/80 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <ShieldAlert className="size-4" />
                    {acquireLeaseMut.isPending ? "申请中…" : isHighRisk ? "申请租约（需审批）" : "申请租约"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm("确认吊销当前活跃租约？此操作将立即终止连接器访问权限。")) {
                        revokeLeaseMut.mutate(activeLease.leaseId);
                      }
                    }}
                    disabled={revokeLeaseMut.isPending}
                    className="border-danger text-danger hover:bg-danger/10 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="size-4" />
                    {revokeLeaseMut.isPending ? "吊销中…" : "吊销租约"}
                  </button>
                )}
                {acquireLeaseMut.isError && (
                  <p className="text-danger text-xs text-center">
                    {String(acquireLeaseMut.error)}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="border-border border-t p-5 space-y-3 shrink-0">
          {connector.status === "connected" ? (
            <button
              onClick={() => onToggle(connector.id, "available")}
              className="border-danger text-danger hover:bg-danger/10 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <Link2Off className="size-4" />
              断开连接
            </button>
          ) : isHighRisk ? (
            <button
              onClick={() => setShowApprovalGuide(true)}
              className="bg-warning/10 text-warning border-warning/30 hover:bg-warning/20 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <ShieldAlert className="size-4" />
              需审批授权 — 点击查看流程
            </button>
          ) : (
            <button
              onClick={() => onToggle(connector.id, "connected")}
              className="bg-brand text-white hover:bg-brand/80 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <Link2 className="size-4" />
              连接
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(connector.id)}
              disabled={isDeleting}
              className="border-border text-muted-foreground hover:border-danger hover:text-danger hover:bg-danger/5 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {isDeleting ? "删除中…" : "删除连接器"}
            </button>
          )}
        </div>

        {/* 审批引导弹窗 */}
        {showApprovalGuide && (
          <ApprovalGuideDialog
            connector={connector}
            onClose={() => setShowApprovalGuide(false)}
          />
        )}
      </div>
    </>
  );
}

/** L3/L4 连接器审批引导弹窗 */
function ApprovalGuideDialog({
  connector,
  onClose,
}: {
  connector: Connector;
  onClose: () => void;
}) {
  const router = useRouter();
  const autoLevel = connector.requiredAutomationLevel || "L3";

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border-border w-full max-w-md rounded-2xl border shadow-2xl pointer-events-auto animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="border-border flex items-center gap-3 border-b px-5 py-4">
            <div className="bg-danger/10 text-danger rounded-xl p-2.5">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h2 className="text-foreground text-base font-semibold">需要审批授权</h2>
              <p className="text-hint text-xs">此连接器要求 {autoLevel} 级别授权</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            <div>
              <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-2">为什么需要审批？</h3>
              <div className="bg-danger/5 border border-danger/20 rounded-xl p-3 text-xs text-muted-foreground space-y-1.5">
                <p><strong className="text-foreground">连接器：</strong>{connector.name}（{connector.category}）</p>
                <p><strong className="text-foreground">风险等级：</strong><span className="text-danger font-medium">{autoLevel === "L4" ? "极高 — 人工执行，禁止自动" : "高 — 写操作/外发，需审批"}</span></p>
                <p><strong className="text-foreground">权限范围：</strong>{connector.authScope === "readwrite" ? "双向读写" : "读取"}{connector.permissions.length > 0 ? `（${connector.permissions.slice(0, 4).join("、")}）` : ""}</p>
              </div>
            </div>

            <div>
              <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-2">审批流程</h3>
              <div className="space-y-2">
                {[
                  { step: "1", label: "提交连接请求", desc: "系统自动生成 ApprovalCheckpoint，写入 AuditLog" },
                  { step: "2", label: "管理员审批", desc: "工作空间 ADMIN 角色在审批中心审核风险等级与调用范围" },
                  { step: "3", label: "获取 leaseToken", desc: "审批通过后系统颁发临时租用令牌（有效期 1 小时）" },
                  { step: "4", label: "连接器可用", desc: "携带 leaseToken 调用连接器，每次调用写入 ActionReceipt" },
                ].map((item) => (
                  <div key={item.step} className="flex gap-3 items-start">
                    <span className="bg-accent text-foreground rounded-lg size-6 flex items-center justify-center text-xs font-bold shrink-0">{item.step}</span>
                    <div><p className="text-foreground text-xs font-semibold">{item.label}</p><p className="text-hint text-[11px]">{item.desc}</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-accent/50 rounded-xl p-3 flex items-start gap-2">
              <Info className="size-3.5 text-hint shrink-0 mt-0.5" />
              <p className="text-hint text-[11px] leading-relaxed">
                所有审批操作将写入 <code className="text-muted-foreground bg-accent rounded px-1 text-[10px]">AuditLog</code> 表，
                action 为 <code className="text-muted-foreground bg-accent rounded px-1 text-[10px]">approval.requested</code>，
                绑定 taskId 与 workflowRunId，可供合规溯源。
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-4">
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl px-4 py-2 text-sm font-medium transition-colors">取消</button>
            <button type="button" onClick={() => { onClose(); router.push("/workspace/approvals"); }} className="bg-brand text-white hover:bg-brand/80 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
              前往审批中心<ExternalLink className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** 新建连接器弹窗 */
function CreateConnectorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ConnectorCategory>("email");
  const [description, setDescription] = useState("");
  const [iconEmoji, setIconEmoji] = useState("🔌");
  const [source, setSource] = useState<"custom" | "industry-pack">("custom");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !category) {
      toast.error("请填写名称和分类");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.createConnector({
        name: name.trim(),
        category,
        description: description.trim(),
        iconEmoji: iconEmoji || "🔌",
        source,
      });
      toast.success("连接器创建成功");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border-border w-full max-w-md rounded-2xl border shadow-2xl pointer-events-auto animate-in zoom-in-95 duration-150">
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-foreground text-base font-semibold">
              新建连接器
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                名称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：企业微信、Salesforce"
                className="bg-sidebar border-border text-foreground placeholder:text-hint w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                分类
              </label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ConnectorCategory)
                }
                className="bg-sidebar border-border text-foreground w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50"
              >
                {(Object.entries(CATEGORY_LABEL) as [string, string][])
                  .filter(([k]) => k !== "all")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述此连接器的用途…"
                rows={3}
                className="bg-sidebar border-border text-foreground placeholder:text-hint w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50 resize-none"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                图标 Emoji
              </label>
              <input
                type="text"
                value={iconEmoji}
                onChange={(e) => setIconEmoji(e.target.value)}
                className="bg-sidebar border-border text-foreground w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </div>
          </div>
          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="bg-brand text-white hover:bg-brand/80 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {submitting ? "创建中…" : "创建"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** 智慧大脑 → 连接器 MCP 页 */
export default function ConnectorsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    ConnectorCategory | "all"
  >("all");
  const [showConnected, setShowConnected] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [drawerConnector, setDrawerConnector] = useState<Connector | null>(
    null,
  );

  const loadAgents = useAgentStore((s) => s.loadAgents);
  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const queryClient = useQueryClient();

  const { data: connectorsData, isLoading } = useQuery({
    queryKey: ["brain-connectors"],
    queryFn: () => apiClient.getBrainConnectors(),
  });

  const connectors: Connector[] = (connectorsData?.connectors ||
    []) as Connector[];

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiClient.toggleBrainConnector(id, status);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["brain-connectors"] });
      const previousData = queryClient.getQueryData(["brain-connectors"]);
      queryClient.setQueryData(["brain-connectors"], (old: any) => {
        if (!old || !old.connectors) return old;
        return {
          ...old,
          connectors: old.connectors.map((c: any) =>
            c.id === id ? { ...c, status } : c,
          ),
        };
      });
      return { previousData };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(["brain-connectors"], context.previousData);
      }
      toast.error(err instanceof Error ? err.message : "状态更新失败");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-connectors"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await apiClient.deleteConnector(id, false);
      } catch (err) {
        if (err instanceof ConfirmationRequiredError) {
          const confirmed = window.confirm(
            "确定要删除此连接器吗？此操作不可撤销。",
          );
          if (confirmed) {
            return await apiClient.deleteConnector(id, true);
          }
          throw new Error("已取消删除");
        }
        throw err;
      }
    },
    onSuccess: () => {
      toast.success("连接器已删除");
      queryClient.invalidateQueries({ queryKey: ["brain-connectors"] });
      setDrawerConnector(null);
    },
    onError: (err) => {
      if (err instanceof Error && err.message !== "已取消删除") {
        toast.error(err.message);
      }
    },
  });

  const handleToggle = (id: string, next: "connected" | "available") => {
    toggleMutation.mutate({ id, status: next });
    setDrawerConnector((prev) =>
      prev && prev.id === id ? { ...prev, status: next } : prev,
    );
  };

  const filtered = useMemo(() => {
    let list = [...connectors];

    if (activeCategory !== "all") {
      list = list.filter((c) => c.category === activeCategory);
    }

    if (showConnected) {
      list = list.filter((c) => c.status === "connected");
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      );
    }

    return list;
  }, [connectors, activeCategory, showConnected, search]);

  return (
    <PageTransition>
      <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
        <PageHeader
          title="连接器"
          description="邮件、IM、CRM、ERP、文档与 API 的统一接入授权管理"
        />

        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between gap-4">
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
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowConnected(!showConnected)}
            className={cn(
              "border-border inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              showConnected
                ? "bg-success/10 text-success border-success/30"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {showConnected ? "已连接" : "可用"}
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="bg-brand text-white hover:bg-brand/80 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <Plus className="size-3.5" />
            新建
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
                <ConnectorCard
                  connector={connector}
                  onConnect={() => handleToggle(connector.id, "connected")}
                  onDisconnect={() => handleToggle(connector.id, "available")}
                  onStatusChange={handleToggle}
                />
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
            onDelete={(id) => deleteMutation.mutate(id)}
            isDeleting={deleteMutation.isPending}
            canDelete={drawerConnector.source !== "builtin"}
          />
        )}

        {/* 新建弹窗 */}
        {showCreateModal && (
          <CreateConnectorModal
            onClose={() => setShowCreateModal(false)}
            onCreated={() => {
              setShowCreateModal(false);
              queryClient.invalidateQueries({
                queryKey: ["brain-connectors"],
              });
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}
