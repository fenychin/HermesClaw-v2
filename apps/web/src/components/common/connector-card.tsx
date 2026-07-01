"use client";

import type { Connector } from "@/types";
import { cn } from "@/lib/utils";
import { ShieldAlert, CheckCircle2, XCircle, Shield, Lock, Loader2, RefreshCw, Plug, ShieldOff, X, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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

const BRAND_LOGOS: Record<string, string> = {
  'Gmail': '/logos/gmail.svg',
  'Outlook': '/logos/outlook.svg',
  'Slack': '/logos/slack.svg',
  'Discord': '/logos/discord.svg',
  'HubSpot': '/logos/hubspot.svg',
  'SAP Business One': '/logos/sap.svg',
  'Notion': '/logos/notion.svg',
  'Google Drive': '/logos/googledrive.svg',
  'Stripe': '/logos/stripe.svg',
  'GitHub': '/logos/github.svg',
  // 外贸专属
  '外贸邮件群发器': '/logos/sendgrid.svg',
  'WhatsApp Bulk Sender': '/logos/whatsapp.svg',
  '海关数据分析器': '/logos/trade.svg',
  'Alibaba RFQ 同步器': '/logos/alibaba.svg',
  '外贸客户管理(CRM)连接器': '/logos/salesforce.svg',
  '外贸工厂 ERP 同步器': '/logos/odoo.svg',
  '外贸报价计算引擎': '/logos/xe.svg',
  '外贸物流运费跟踪器': '/logos/flexport.svg',
  '外贸多语种合同解析器': '/logos/docusign.svg',
  '外贸海关关税计算器': '/logos/wto.svg',
};

export function ConnectorIcon({ name, emoji, className }: { name: string; emoji: string; className?: string }) {
  const logoUrl = BRAND_LOGOS[name];
  if (logoUrl) {
    return (
      <div className={cn("size-10 rounded-xl bg-white flex items-center justify-center border border-border/80 shadow-sm shrink-0 p-1.5", className)}>
        <img
          src={logoUrl}
          alt={name}
          className="size-7 object-contain rounded"
        />
      </div>
    );
  }
  return (
    <span className={cn("text-3xl leading-none shrink-0", className)} role="img" aria-label={name}>
      {emoji}
    </span>
  );
}

interface ConnectorCardProps {
  connector: Connector;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onStatusChange?: (id: string, nextStatus: "connected" | "available") => void;
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
  onStatusChange,
}: ConnectorCardProps) {
  const successRate = connector.successRate;
  const failureRate = connector.failureRate;
  const autoLevel = connector.requiredAutomationLevel || "L1";
  const isHighRisk = autoLevel === "L3" || autoLevel === "L4";

  // 用 any 别名绕过未定义的后端映射扩展字段类型报错
  const conn = connector as any;

  // 状态管理
  const [healthStatus, setHealthStatus] = useState<
    "checking" | "healthy" | "degraded" | "unreachable" | "unconfigured" | "pending_approval"
  >("unconfigured");
  const [latency, setLatency] = useState<number | null>(null);

  // Modal 控制
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // 向导表单字段
  const [wizardCredentials, setWizardCredentials] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [confirmRiskAcknowledged, setConfirmRiskAcknowledged] = useState(false);
  const [testBeforeSave, setTestBeforeSave] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // 加载时自适应触发健康检测
  useEffect(() => {
    if ((connector.status as string) === "pending_approval") {
      setHealthStatus("pending_approval");
    } else if (connector.status === "connected") {
      runHealthCheck(connector.id);
    } else {
      setHealthStatus("unconfigured");
    }
  }, [connector.id, connector.status]);

  // 健康检测逻辑
  const runHealthCheck = async (id: string) => {
    setHealthStatus("checking");
    try {
      const res = await fetch(`/api/connectors/${id}/health`);
      if (res.ok) {
        const data = await res.json();
        setLatency(data.latency ?? 20);
        setHealthStatus(data.status ?? "healthy");
      } else {
        // 如果未配置（例如配置不存在 404），则设为 unconfigured
        if (res.status === 404 || res.status === 400) {
          setHealthStatus("unconfigured");
        } else {
          setHealthStatus("unreachable");
        }
      }
    } catch {
      setHealthStatus("unreachable");
    }
  };

  // 快速向导配置打开时初始化表单
  const openSetupWizard = (id: string) => {
    const initialCreds: Record<string, string> = {};
    (conn.requiredEnvVars ?? []).forEach((key: string) => {
      initialCreds[key] = "";
    });
    setWizardCredentials(initialCreds);
    setConfirmRiskAcknowledged(false);
    setWizardError(null);
    setShowSetupWizard(true);
  };

  // 快速向导配置提交
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmRiskAcknowledged) {
      setWizardError("必须勾选并确认已了解连接器数据访问范围");
      return;
    }

    const missing = (conn.requiredEnvVars ?? []).filter(
      (key: string) => !wizardCredentials[key]
    );
    if (missing.length > 0) {
      setWizardError(`请填写所有必需凭证字段：${missing.join(", ")}`);
      return;
    }

    setIsSubmitting(true);
    setWizardError(null);

    try {
      const res = await fetch(`/api/connectors/${connector.id}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: wizardCredentials,
          confirmRiskAcknowledged: true,
          testBeforeSave,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "配置保存失败");
      }

      toast.success(data.message || "连接器配置成功！");
      setShowSetupWizard(false);

      if (data.status === "pending_approval") {
        setHealthStatus("pending_approval");
      } else {
        setHealthStatus("healthy");
        runHealthCheck(connector.id);
      }

      // 通知列表页刷新数据
      if (onConnect) onConnect();
      if (onStatusChange) onStatusChange(connector.id, "connected");
    } catch (err: any) {
      setWizardError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 切换密码可见性
  const togglePasswordVisibility = (key: string) => {
    setShowPassword((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 断开连接逻辑
  const toggleConnection = (id: string) => {
    const nextStatus = connector.status === "connected" ? "available" : "connected";
    if (nextStatus === "available") {
      if (onDisconnect) onDisconnect();
      if (onStatusChange) onStatusChange(id, "available");
      setHealthStatus("unconfigured");
      toast.success("已成功断开连接");
    }
  };

  const confirmDisconnect = (id: string) => {
    setShowDisconnectConfirm(true);
  };

  const handleDisconnectConfirm = () => {
    setShowDisconnectConfirm(false);
    if (onDisconnect) onDisconnect();
    if (onStatusChange) onStatusChange(connector.id, "available");
    setHealthStatus("unconfigured");
    toast.success("高风险连接器已安全断开，安全审计日志已写入");
  };

  const reconnect = (id: string) => {
    runHealthCheck(id);
    if (onConnect) onConnect();
    if (onStatusChange) onStatusChange(id, "connected");
  };

  return (
    <div className="bg-card border-border rounded-card border p-5 flex flex-col justify-between min-h-[180px] text-left">
      {/* 顶部：iconEmoji + 名称 + category badge */}
      <div>
        <div className="flex items-start gap-3">
          <ConnectorIcon name={connector.name} emoji={connector.iconEmoji} />
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

            {/* ── 安全状态指示层（核心新增）─────────────── */}
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {/* 认证类型徽章 */}
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-mono border",
                conn.authType === "oauth2"
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  : conn.authType === "apikey"
                  ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                  : conn.authType === "webhook-secret"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-white/5 border-white/10 text-white/30"
              )}>
                {conn.authType ?? "无认证"}
              </span>

              {/* 风险等级徽章 */}
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5",
                conn.riskLevel === "high"
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : conn.riskLevel === "medium"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-white/5 border-white/10 text-white/30"
              )}>
                <Shield size={8} />
                {conn.riskLevel === "high" ? "高风险" : conn.riskLevel === "medium" ? "中风险" : "低风险"}
              </span>

              {/* 审批门禁（仅高风险且需要审批的连接器显示）*/}
              {conn.requiresApproval && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-0.5">
                  <Lock size={8} />
                  需管理员审批
                </span>
              )}
            </div>

            {/* 描述：最多两行 */}
            <p className="text-hint mt-2 line-clamp-2 text-xs leading-relaxed">
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

      {/* ── 健康状态实时指示（替换原底端状态栏）─── */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
        {/* 实时健康状态 */}
        <div className="flex items-center gap-1.5">
          {healthStatus === "checking" && (
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
          )}
          {healthStatus === "healthy" && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success">
                已连接
                {latency && <span className="text-success/60 ml-1">{latency}ms</span>}
              </span>
            </div>
          )}
          {healthStatus === "degraded" && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span className="text-xs text-warning">性能下降</span>
            </div>
          )}
          {healthStatus === "unreachable" && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <span className="text-xs text-danger">连接中断</span>
            </div>
          )}
          {healthStatus === "unconfigured" && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-border" />
              <span className="text-xs text-muted-foreground">待配置</span>
            </div>
          )}
          {healthStatus === "pending_approval" && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span className="text-xs text-warning">待管理员审批</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {/* 健康检测按钮（已配置的连接器）*/}
          {healthStatus !== "unconfigured" && (
            <button
              onClick={() => runHealthCheck(connector.id)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <RefreshCw size={10} />
              检测
            </button>
          )}

          {/* 快速接入向导（未配置的连接器）*/}
          {healthStatus === "unconfigured" && (
            <button
              onClick={() => openSetupWizard(connector.id)}
              className="text-[11px] px-3 py-1 bg-brand/10 border border-brand/20 text-brand rounded-lg hover:bg-brand/20 transition-all flex items-center gap-1"
            >
              <Plug size={10} />
              快速接入
            </button>
          )}

          {/* 高风险：断开按钮 */}
          {healthStatus === "healthy" && conn.riskLevel === "high" && (
            <button
              onClick={() => confirmDisconnect(connector.id)}
              className="text-[11px] text-danger/80 hover:text-danger transition-colors flex items-center gap-1"
            >
              <ShieldOff size={10} />
              断开
            </button>
          )}

          {/* 普通：断开/重连 */}
          {healthStatus === "healthy" && conn.riskLevel !== "high" && (
            <button
              onClick={() => toggleConnection(connector.id)}
              className="text-[11px] text-danger/80 hover:text-danger transition-colors"
            >
              断开
            </button>
          )}
          {(healthStatus === "unreachable" || healthStatus === "degraded") && (
            <button
              onClick={() => reconnect(connector.id)}
              className="text-[11px] px-3 py-1 bg-success/10 border border-success/20 text-success rounded-lg hover:bg-success/20 transition-all"
            >
              重连
            </button>
          )}
        </div>
      </div>

      {/* ── 快速配置向导弹窗 Modal ─────────────── */}
      {showSetupWizard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ConnectorIcon name={connector.name} emoji={connector.iconEmoji} className="size-8" />
                <div>
                  <h3 className="font-semibold text-foreground text-sm">配置连接器: {connector.name}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">三域架构 · 安全执行现场隔离设置</p>
                </div>
              </div>
              <button onClick={() => setShowSetupWizard(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent">
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSetupSubmit} className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4 text-xs">
              {wizardError && (
                <div className="bg-danger/10 border border-danger/20 text-danger p-3 rounded-lg flex items-start gap-2">
                  <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  <span>{wizardError}</span>
                </div>
              )}

              {/* 环境变量敏感项列表 */}
              {conn.requiredEnvVars && conn.requiredEnvVars.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="font-medium text-foreground border-b border-border pb-1.5">运行必需凭证 (Encrypted API Credentials)</h4>
                  {conn.requiredEnvVars.map((envKey: string) => (
                    <div key={envKey} className="flex flex-col gap-1.5">
                      <label className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                        <Lock size={9} />
                        {envKey}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword[envKey] ? "text" : "password"}
                          value={wizardCredentials[envKey] || ""}
                          onChange={(e) => setWizardCredentials({ ...wizardCredentials, [envKey]: e.target.value })}
                          className="w-full bg-accent border border-border rounded-lg pl-3 pr-10 py-2 font-mono text-[11px] placeholder-muted-foreground focus:outline-none focus:border-brand transition-colors text-foreground"
                          placeholder={`请输入 ${envKey} 的值`}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(envKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword[envKey] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 权限审查范围 */}
              <div className="bg-accent/50 border border-border p-3.5 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Shield size={12} className="text-brand" />
                  <span>数据访问审查 (Data Access Boundary)</span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed pl-4 list-disc flex flex-col gap-1">
                  {(conn.dataAccess ?? []).length > 0 ? (
                    (conn.dataAccess ?? []).map((access: string, i: number) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-brand" />
                        {access}
                      </span>
                    ))
                  ) : (
                    <span>该连接器具有基本的读写和执行权限。</span>
                  )}
                </div>
              </div>

              {/* 安全复选框 */}
              <div className="flex flex-col gap-2.5 mt-2">
                <label className="flex items-start gap-2 cursor-pointer text-muted-foreground hover:text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={confirmRiskAcknowledged}
                    onChange={(e) => setConfirmRiskAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-border text-brand focus:ring-brand size-3.5 bg-accent"
                  />
                  <span>我确认已了解该连接器的授权边界，允许其依照上述访问范围读写我的数据。</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={testBeforeSave}
                    onChange={(e) => setTestBeforeSave(e.target.checked)}
                    className="rounded border-border text-brand focus:ring-brand size-3.5 bg-accent"
                  />
                  <span>保存前执行连通性自检（推荐，阻断错误配置）</span>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-border pt-4 mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSetupWizard(false)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-accent text-foreground transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-brand text-brand-foreground rounded-lg hover:bg-brand/90 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                  {isHighRisk && conn.requiresApproval ? "保存并提交审批" : "保存并激活"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 高风险断连二次确认 Modal ─────────────── */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-border flex items-center gap-3">
              <div className="size-10 rounded-full bg-danger/10 flex items-center justify-center text-danger">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">高风险断开操作确认</h3>
                <p className="text-[10px] text-muted-foreground">三域安全 · 安全审计级断连拦截</p>
              </div>
            </div>
            <div className="p-6 text-xs text-muted-foreground leading-relaxed flex flex-col gap-4">
              <p>
                您正在尝试断开连接器 <strong className="text-foreground">{connector.name}</strong>。该连接器被标识为 <strong className="text-danger">L3/L4 高风险连接器</strong>。
              </p>
              <div className="bg-danger/10 border border-danger/20 text-danger p-3 rounded-lg flex flex-col gap-1.5">
                <span className="font-medium flex items-center gap-1">
                  <ShieldOff size={11} />
                  断开将产生以下影响：
                </span>
                <ul className="list-disc pl-4 flex flex-col gap-1 text-[11px]">
                  <li>立刻吊销该连接器在执行域的全部物理会话与租约。</li>
                  <li>挂起并停止所有正在依赖此连接器的 Agent 和工作流任务。</li>
                  <li>此次阻断性断连动作将被记录入系统高风险审计日志。</li>
                </ul>
              </div>
              <p>请确认您是否了解此操作带来的业务中断风险？</p>

              <div className="border-t border-border pt-4 mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-accent text-foreground transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectConfirm}
                  className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors font-medium flex items-center gap-1.5"
                >
                  <ShieldOff size={12} />
                  确认安全断开
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
