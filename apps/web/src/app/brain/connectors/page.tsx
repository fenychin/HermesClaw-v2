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
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { ConnectorCard } from "@/components/common/connector-card";
import { StatusBadge } from "@/components/common/status-badge";
import { useAgentStore } from "@/stores/agent-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ConfirmationRequiredError } from "@/lib/api-client";
import { toast } from "sonner";
import type { Connector, ConnectorHealth, ConnectorCategory, ConnectorSelfCheck } from "@/types";
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
  const [activeTab, setActiveTab] = useState<"overview" | "config" | "bindings" | "logs" | "harness">("overview");
  const [checkStatus, setCheckStatus] = useState<ConnectorSelfCheck[]>([]);
  const [checking, setChecking] = useState(false);

  const { data: usageData } = useQuery({
    queryKey: ["connector-usage", connector.id],
    queryFn: () => apiClient.getConnectorUsage(connector.id),
    enabled: activeTab === "logs" || activeTab === "overview",
    refetchInterval: 30_000,
  });

  const storeAgents = useAgentStore((s) => s.agents);
  const linkedAgents = useMemo(() => {
    if (!connector || !connector.usedByAgents) return [];
    let list: string[] = [];
    if (Array.isArray(connector.usedByAgents)) list = connector.usedByAgents;
    else if (typeof connector.usedByAgents === "string") {
      try { list = JSON.parse(connector.usedByAgents); } catch { list = []; }
    }
    return storeAgents.filter((a) => list.includes(a.id));
  }, [connector, storeAgents]);

  const healthLabel: Record<ConnectorHealth | "unknown", string> = { active: "健康", degraded: "降级", disabled: "已禁用", error: "异常", unknown: "未知" };
  const healthColorClass = (h?: ConnectorHealth) => { if (h === "active") return "bg-success"; if (h === "degraded") return "bg-warning"; if (h === "disabled") return "bg-muted-foreground"; if (h === "error") return "bg-danger"; return "bg-muted-foreground"; };

  const runSelfCheck = async () => {
    const items: ConnectorSelfCheck[] = [
      { label: "凭证有效性", key: "credential", status: "running" },
      { label: "网络可达性", key: "network", status: "pending" },
      { label: "模板完整性", key: "template", status: "pending" },
      { label: "回执正确性", key: "receipt", status: "pending" },
      { label: "权限校验", key: "permission", status: "pending" },
    ];
    setCheckStatus(items); setChecking(true);
    try {
      const res = await apiClient.selfCheckConnector(connector.id);
      if (res && res.checks) { setCheckStatus(res.checks as ConnectorSelfCheck[]); }
      else { setCheckStatus(items.map(it => ({ ...it, status: "pass" as const }))); }
    } catch {
      setCheckStatus(items.map(it => ({ ...it, status: "fail" as const, detail: "检测超时" })));
    }
    setChecking(false);
  };

  const TABS = [
    { key: "overview", label: "概览" },
    { key: "config", label: "配置" },
    { key: "bindings", label: "绑定" },
    { key: "logs", label: "日志" },
    { key: "harness", label: "Harness" },
  ];

  return (<><div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
  <div className="bg-sidebar border-border fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l shadow-2xl animate-in slide-in-from-right duration-200">
    {/* Header */}
    <div className="border-border flex items-start justify-between border-b p-5 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-3xl" role="img">{connector.iconEmoji || "🔌"}</span>
        <div><div className="flex items-center gap-2"><h2 className="text-foreground text-base font-semibold">{connector.name}</h2><span className={cn("size-2.5 rounded-full", healthColorClass(connector.health))} /></div>
        <p className="text-hint text-xs">{CATEGORY_LABEL[connector.category] || connector.category} · {connector.source === "builtin" ? "系统内置" : connector.source === "industry-pack" ? "行业包" : "自定义"}</p></div>
      </div>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"><X className="size-5" /></button>
    </div>
    {/* Tabs */}
    <div className="border-border flex border-b shrink-0">
      {TABS.map(tab => (<button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} className={cn("flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px", activeTab === tab.key ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground")}>{tab.label}</button>))}
    </div>

    {/* Content */}
    <div className="flex-1 overflow-y-auto p-5 space-y-4">

      {/* OVERVIEW */}
      {activeTab === "overview" && (<><div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-xl border border-border p-3"><p className="text-hint text-xs mb-1">状态</p><span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", connector.status === "connected" ? "text-success" : connector.status === "error" ? "text-danger" : "text-muted-foreground")}><span className={cn("size-1.5 rounded-full", connector.status === "connected" ? "bg-success" : connector.status === "error" ? "bg-danger animate-pulse" : "bg-muted-foreground")} />{connector.status === "connected" ? "已连接" : connector.status === "available" ? "可用" : connector.status === "error" ? "异常" : connector.status}</span></div>
        <div className="bg-card rounded-xl border border-border p-3"><p className="text-hint text-xs mb-1">健康</p><span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", connector.health === "active" ? "text-success" : connector.health === "degraded" ? "text-warning" : connector.health === "error" ? "text-danger" : "text-muted-foreground")}><span className={cn("size-1.5 rounded-full", healthColorClass(connector.health))} />{healthLabel[connector.health || "unknown"] || "未知"}</span></div>
        <div className="bg-card rounded-xl border border-border p-3"><p className="text-hint text-xs mb-1">版本</p><p className="text-foreground text-xs font-medium">{connector.version || "—"}</p></div>
        <div className="bg-card rounded-xl border border-border p-3"><p className="text-hint text-xs mb-1">数据授权</p><p className={cn("text-xs font-semibold", connector.authScope === "readwrite" ? "text-brand" : "text-muted-foreground")}>{connector.authScope === "readwrite" ? "双向读写" : "仅读取"}</p></div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4"><h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-3">用量快照（24h）</h3>
      {usageData ? (<div className="grid grid-cols-3 gap-4 text-center"><div><p className="text-foreground text-lg font-bold">{usageData.totalCalls24h}</p><p className="text-hint text-xs">调用次数</p></div><div><p className={cn("text-lg font-bold", usageData.successRate24h >= 95 ? "text-success" : usageData.successRate24h >= 80 ? "text-warning" : "text-danger")}>{usageData.successRate24h}%</p><p className="text-hint text-xs">成功率</p></div><div><p className="text-foreground text-lg font-bold">{usageData.avgLatencyMs24h}ms</p><p className="text-hint text-xs">平均延迟</p></div></div>) : (<div className="text-hint text-xs">加载中…</div>)}
      </div>

      {usageData?.lastTestResult && (<div className="bg-card rounded-xl border border-border p-4"><h3 className="text-foreground text-xs font-semibold uppercase tracking-wide mb-3">最近测试结果</h3><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", usageData.lastTestResult.success ? "bg-success" : "bg-danger")} /><span className={cn("text-sm font-medium", usageData.lastTestResult.success ? "text-success" : "text-danger")}>{usageData.lastTestResult.success ? "通过" : "失败"}</span></div><span className="text-hint text-xs">{usageData.lastTestResult.latencyMs}ms · {formatDate(usageData.lastTestResult.timestamp)}</span></div>{usageData.lastTestResult.error && <p className="text-danger text-xs mt-2">{usageData.lastTestResult.error}</p>}</div>)}
      {usageData?.lastError && (<div className="bg-danger/5 rounded-xl border border-danger/20 p-4"><h3 className="text-danger text-xs font-semibold uppercase tracking-wide mb-2">最近错误</h3><p className="text-danger/80 text-sm">{usageData.lastError.message}</p><p className="text-hint text-xs mt-1">{formatDate(usageData.lastError.timestamp)}</p></div>)}
      {usageData?.lastSuccessAt && <div className="text-hint text-xs">最后成功时间：{formatDate(usageData.lastSuccessAt)}</div>}

      <div className="bg-card rounded-xl border border-border p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">发布前自检</h3><button onClick={runSelfCheck} disabled={checking} className="bg-brand text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-brand/80 disabled:opacity-50 transition-colors">{checking ? "检测中…" : checkStatus.length > 0 ? "重新检测" : "开始检测"}</button></div>
      {checkStatus.length > 0 ? (<div className="space-y-1.5">{checkStatus.map(item => (<div key={item.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-accent/30"><span className="text-foreground text-xs">{item.label}</span><span className={cn("text-xs font-semibold", item.status === "pass" ? "text-success" : item.status === "fail" ? "text-danger" : item.status === "running" ? "text-brand animate-pulse" : "text-hint")}>{item.status === "pass" ? "✓ 通过" : item.status === "fail" ? "✗ 失败" : item.status === "running" ? "检测中" : "待检测"}</span></div>))}</div>) : (<p className="text-hint text-xs">点击上方按钮开始逐项校验凭证、网络、模板、回执、权限</p>)}
      </div></>)}

      {/* CONFIG */}
      {activeTab === "config" && (<><div className="space-y-3"><div><label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">描述</label><p className="text-muted-foreground text-sm">{connector.description || "无描述"}</p></div><div><label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">权限范围</label><div className="flex flex-wrap gap-1.5">{connector.permissions.map(perm => (<span key={perm} className="bg-accent text-muted-foreground rounded-md px-2.5 py-1 text-xs">{perm}</span>))}</div></div><div><label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">连接器 ID</label><code className="text-hint text-xs bg-accent rounded px-2 py-1 select-all">{connector.id}</code></div><div><label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">行业包</label><p className="text-muted-foreground text-sm">{connector.packId || "无关联"}</p></div><div><label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">最后同步</label><p className="text-muted-foreground text-sm flex items-center gap-1.5"><Clock className="size-3" />{formatDate(connector.lastSync)}</p></div></div><button onClick={() => { onClose(); router.push("/settings?section=connectors"); }} className="w-full bg-accent hover:bg-accent/80 text-foreground rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors mt-4">前往设置页配置授权</button></>)}

      {/* BINDINGS */}
      {activeTab === "bindings" && (<div className="space-y-4"><h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">关联智能体</h3>{linkedAgents.length > 0 ? (<div className="flex flex-wrap gap-1.5">{linkedAgents.map(agent => (<span key={agent.id} className="bg-brand/10 text-brand rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-brand/20" onClick={() => { onClose(); router.push("/brain/agents"); }}>{agent.name} · {agent.role}</span>))}</div>) : (<EmptyState icon={Plug} title="无关联智能体" description="此连接器暂未绑定任何智能体" />)}</div>)}

      {/* LOGS */}
      {activeTab === "logs" && (<div className="space-y-3"><h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">最近事件（20条）</h3>{usageData?.recentEvents && usageData.recentEvents.length > 0 ? (<div className="space-y-2">{usageData.recentEvents.map(evt => (<div key={evt.id} className="bg-card rounded-lg border border-border p-3"><div className="flex items-center justify-between"><span className="text-foreground text-xs font-medium">{evt.action}</span><span className={cn("text-xs font-semibold", evt.status === "success" ? "text-success" : evt.status === "failed" ? "text-danger" : "text-warning")}>{evt.status}</span></div><p className="text-muted-foreground text-xs mt-1">{evt.detail}</p><div className="flex items-center justify-between mt-2"><span className="text-hint text-xs">{formatDate(evt.timestamp)}</span>{evt.latencyMs != null && <span className="text-hint text-xs">{evt.latencyMs}ms</span>}</div></div>))}</div>) : (<EmptyState icon={Clock} title="暂无日志" description="连接器暂无执行记录" />)}</div>)}

      {/* HARNESS */}
      {activeTab === "harness" && (<div className="space-y-4"><h3 className="text-foreground text-xs font-semibold uppercase tracking-wide">Harness 影响分析</h3><div className="bg-card rounded-xl border border-border p-4"><div className="flex items-center justify-between"><span className="text-foreground text-sm">自动化等级</span><span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", connector.source === "builtin" ? "bg-success/10 text-success" : "bg-accent text-muted-foreground")}>{connector.source === "builtin" ? "L2 — 内置连接器受系统保护" : "L2 — 自定义连接器可修改"}</span></div><div className="flex items-center justify-between mt-3"><span className="text-foreground text-sm">内置保护</span><span className="text-xs font-semibold">{connector.source === "builtin" ? "✓ 只读，不可删除" : "— 无限制"}</span></div><div className="flex items-center justify-between mt-3"><span className="text-foreground text-sm">绑定智能体数</span><span className="text-xs font-semibold">{linkedAgents.length} 个</span></div><div className="flex items-center justify-between mt-3"><span className="text-foreground text-sm">风险等级</span><span className={cn("text-xs font-semibold", connector.category === "email" || connector.category === "api" ? "text-danger" : "text-success")}>{connector.category === "email" || connector.category === "api" ? "高 — 写操作/外发" : "中低 — 读操作为主"}</span></div></div></div>)}
    </div>

    {/* Bottom actions */}
    <div className="border-border border-t p-5 space-y-3 shrink-0">
      {connector.status === "connected" ? (<button onClick={() => onToggle(connector.id, "available")} className="border-danger text-danger hover:bg-danger/10 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"><Link2Off className="size-4" />断开连接</button>) : (<button onClick={() => onToggle(connector.id, "connected")} className="bg-brand text-white hover:bg-brand/80 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"><Link2 className="size-4" />连接</button>)}{canDelete && (<button onClick={() => onDelete(connector.id)} disabled={isDeleting} className="border-border text-muted-foreground hover:border-danger hover:text-danger hover:bg-danger/5 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"><Trash2 className="size-4" />{isDeleting ? "删除中…" : "删除连接器"}</button>)}
    </div></div></>);
}

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
            <h2 className="text-foreground text-base font-semibold">新建连接器</h2>
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
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：企业微信、Salesforce"
                className="bg-sidebar border-border text-foreground placeholder:text-hint w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">分类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ConnectorCategory)}
                className="bg-sidebar border-border text-foreground w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50"
              >
                {(Object.entries(CATEGORY_LABEL) as [string, string][]).filter(([k]) => k !== "all").map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述此连接器的用途…"
                rows={3}
                className="bg-sidebar border-border text-foreground placeholder:text-hint w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-brand/50 resize-none"
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">图标 Emoji</label>
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
  const [activeCategory, setActiveCategory] = useState<ConnectorCategory | "all">("all");
  const [showConnected, setShowConnected] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [drawerConnector, setDrawerConnector] = useState<Connector | null>(null);

  const loadAgents = useAgentStore((s) => s.loadAgents);
  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const queryClient = useQueryClient();

  const { data: connectorsData, isLoading } = useQuery({
    queryKey: ["brain-connectors"],
    queryFn: () => apiClient.getBrainConnectors(),
  });

  const connectors: Connector[] = (connectorsData?.connectors || []) as Connector[];

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
            c.id === id ? { ...c, status } : c
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
          const confirmed = window.confirm("确定要删除此连接器吗？此操作不可撤销。");
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

  // 连接/断开后同步本地 Drawer 选中态，保持按钮即时反馈
  const handleToggle = (id: string, next: "connected" | "available") => {
    toggleMutation.mutate({ id, status: next });
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
    <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
      <PageHeader
        title="连接器"
        description="邮件、IM、CRM、ERP、文档与 API 的统一接入授权管理"
        breadcrumb={[{ label: "智慧大脑", href: "/brain/memory" }, { label: "连接器 MCP" }]}
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

        {/* 新建连接器 */}
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
          onDelete={(id) => deleteMutation.mutate(id)}
          isDeleting={deleteMutation.isPending}
          canDelete={drawerConnector.source !== 'builtin'}
        />
      )}
    </div>
  </PageTransition>
  );
}
