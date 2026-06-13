"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Zap,
  Layers,
  Puzzle,
  Plug,
  Mic,
  ImageIcon,
  Video,
  ArrowRight,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { useMemoryStore } from "@/stores/memory-store";
import { useSkillStore } from "@/stores/skill-store";
import { useConnectorStore } from "@/stores/connector-store";
import { useTradeStore } from "@/stores/trade-store";
import { apiClient } from "@/lib/api-client";
import type { EvolutionLogEntry } from "@/types";

/** 将 ISO 时间格式化为 "YYYY-MM-DD HH:mm"；空值回退占位 */
function formatDateTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** 能力概览卡数据 */
interface CapabilityCard {
  title: string;
  icon: LucideIcon;
  color: string;
  href: string;
  stats: { label: string; value: string }[];
  description: string;
}

/** 能力概览卡组件 */
function CapabilityCard({ card }: { card: CapabilityCard }) {
  const router = useRouter();
  const Icon = card.icon;

  return (
    <button
      type="button"
      onClick={() => router.push(card.href)}
      className="bg-card border-border hover:border-brand/30 hover:bg-accent/50 rounded-2xl border p-5 text-left transition-all"
    >
      {/* 图标 + 标题 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-foreground truncate text-sm font-semibold">
            {card.title}
          </h3>
        </div>
        <ArrowRight className="text-hint size-4 shrink-0" />
      </div>

      {/* 核心数字 */}
      <div className="mb-3 flex flex-wrap gap-4">
        {card.stats.map((stat) => (
          <div key={stat.label}>
            <span
              className="text-xl font-bold"
              style={{ color: card.color }}
            >
              {stat.value}
            </span>
            <span className="text-hint ml-1 text-xs">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* 说明 */}
      <p className="text-hint line-clamp-2 text-xs leading-relaxed">
        {card.description}
      </p>
    </button>
  );
}

/** 智慧大脑总览页 */
export default function BrainOverviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  /* 订阅原始数据，避免 selector 中 filter 返回新引用导致无限渲染 */
  const memories = useMemoryStore((s) => s.memories);
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const connectors = useConnectorStore((s) => s.connectors);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);
  const harnessProposals = useTradeStore((s) => s.harnessProposals);
  const loadProposals = useTradeStore((s) => s.loadProposals);

  const shortCount = useMemo(
    () => memories.filter((m) => m.type === "short").length,
    [memories]
  );
  const midCount = useMemo(
    () => memories.filter((m) => m.type === "mid").length,
    [memories]
  );
  const longCount = useMemo(
    () => memories.filter((m) => m.type === "long").length,
    [memories]
  );
  const activeSkills = useMemo(
    () => skills.filter((s) => s.status === "active").length,
    [skills]
  );
  const connectedConnectors = useMemo(
    () => connectors.filter((c) => c.status === "connected").length,
    [connectors]
  );
  const pendingProposals = useMemo(
    () => (harnessProposals || []).filter((p) => p.status === "pending"),
    [harnessProposals]
  );

  // 挂载时加载提案、技能、连接器，使概览计数与待审批预览准确
  useEffect(() => {
    loadProposals();
    loadSkills();
    loadConnectors();
  }, [loadProposals, loadSkills, loadConnectors]);

  // Harness 演化引擎实时状态
  const {
    data: harnessStatus,
    isLoading: statusLoading,
  } = useQuery({
    queryKey: ["harness-status"],
    queryFn: () => apiClient.getHarnessStatus(),
  });

  // Harness 进化历史（最近评估记录）
  const { data: evolutionData } = useQuery({
    queryKey: ["harness-evolution-log"],
    queryFn: () => apiClient.getEvolutionLog(8),
  });
  const evolutionLogs = (evolutionData?.logs ?? []) as EvolutionLogEntry[];

  // 一次性提示：本次手动评估的结果
  const [evalNotice, setEvalNotice] = useState<{
    tone: "success" | "info" | "error";
    text: string;
  } | null>(null);

  // 手动触发评估
  const evaluateMutation = useMutation({
    mutationFn: () => apiClient.triggerHarnessEvaluate("manual"),
    onSuccess: async (result) => {
      if (result.triggered && result.proposal) {
        setEvalNotice({
          tone: "success",
          text: `已生成升级提案 ${result.proposal.proposalId}（${result.provider} · ${result.model}），失败率 ${(result.metrics.errorRate * 100).toFixed(1)}%`,
        });
      } else {
        setEvalNotice({
          tone: "info",
          text: result.reason ?? "本次评估未触发升级提案，系统指标健康",
        });
      }
      // 刷新状态、提案列表与进化历史
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["harness-status"] }),
        queryClient.invalidateQueries({ queryKey: ["harness-evolution-log"] }),
        loadProposals(),
      ]);
    },
    onError: (err) => {
      setEvalNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "评估触发失败",
      });
    },
  });

  const cards: CapabilityCard[] = [
    {
      title: "记忆系统",
      icon: Layers,
      color: "#4DA3FF",
      href: "/brain/short-memory",
      stats: [
        { label: "短期", value: String(shortCount) },
        { label: "中期", value: String(midCount) },
        { label: "长期", value: String(longCount) },
      ],
      description: "三级记忆体系：实时会话上下文、项目客户沉淀、企业 SOP 知识库",
    },
    {
      title: "技能库",
      icon: Puzzle,
      color: "#7C5CFF",
      href: "/brain/skills",
      stats: [
        { label: "个技能", value: String(skills.length) },
        { label: "个活跃", value: String(activeSkills) },
      ],
      description: "行业 / 岗位 / 自定义技能，版本化、可测试、可绑定至智能体",
    },
    {
      title: "连接器",
      icon: Plug,
      color: "#37C99A",
      href: "/brain/connectors",
      stats: [
        { label: "个可用", value: String(connectors.length) },
        { label: "个已连接", value: String(connectedConnectors) },
      ],
      description: "邮件、IM、CRM、ERP、文档与 API 的统一接入授权管理",
    },
    {
      title: "语音资产",
      icon: Mic,
      color: "#F0A43B",
      href: "/brain/voice",
      stats: [{ label: "个音色", value: "3" }],
      description: "品牌声音、外呼模板与多语种语音资产管理",
    },
    {
      title: "图像资产",
      icon: ImageIcon,
      color: "#4DA3FF",
      href: "/brain/images",
      stats: [{ label: "张图片", value: "48" }],
      description: "产品图、证书、营销素材与 OCR 识别内容库",
    },
    {
      title: "视频资产",
      icon: Video,
      color: "#7C5CFF",
      href: "/brain/videos",
      stats: [{ label: "个视频", value: "12" }],
      description: "产品讲解、演示视频与数字人口播素材库",
    },
  ];

  return (
    <PageTransition>
    <div className="space-y-6">
      <PageHeader
        title="智慧大脑"
        description="Hermes 控制面"
      />

      {/* 能力概览卡网格 */}
      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => (
          <CapabilityCard key={card.href} card={card} />
        ))}
      </div>

      {/* Harness 演化状态（实时） */}
      <div className="bg-card border-border rounded-2xl border p-6">
        <div className="mb-4 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand/10 flex size-8 items-center justify-center rounded-lg">
              <Zap className="text-brand size-4" />
            </div>
            <h2 className="text-foreground text-base font-semibold">
              Harness 演化状态
            </h2>
          </div>

          {/* 手动触发评估 */}
          <button
            type="button"
            onClick={() => {
              setEvalNotice(null);
              evaluateMutation.mutate();
            }}
            disabled={evaluateMutation.isPending}
            className="bg-brand text-white hover:bg-brand/90 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {evaluateMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                评估中…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                手动触发评估
              </>
            )}
          </button>
        </div>

        {/* 评估结果提示 */}
        {evalNotice ? (
          <div
            className={
              "mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs " +
              (evalNotice.tone === "success"
                ? "border-success/30 bg-success/5 text-success"
                : evalNotice.tone === "error"
                  ? "border-danger/30 bg-danger/5 text-danger"
                  : "border-brand-blue/30 bg-brand-blue/5 text-brand-blue")
            }
          >
            {evalNotice.tone === "error" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>{evalNotice.text}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-6">
          {/* 左侧：评估信息（来自 /api/harness/status） */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">最近评估</span>
              <span className="text-foreground text-sm font-medium">
                {statusLoading
                  ? "加载中…"
                  : formatDateTime(harnessStatus?.lastEvaluatedAt, "尚未评估")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">评估周期</span>
              <span className="text-foreground text-sm">
                {harnessStatus?.intervalHours ?? 72} 小时
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">下次评估</span>
              <span className="text-foreground text-sm font-medium">
                {statusLoading
                  ? "加载中…"
                  : formatDateTime(harnessStatus?.nextEvaluatedAt, "—")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">历史提案总数</span>
              <span className="text-foreground text-sm">
                {harnessStatus?.totalProposals ?? "—"}
              </span>
            </div>
          </div>

          {/* 右侧：待审批提案 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">待审批提案</span>
              <span className="text-warning text-2xl font-bold">
                {harnessStatus?.pendingCount ?? pendingProposals.length}
              </span>
            </div>
            {pendingProposals.length > 0 && (
              <div className="space-y-1.5">
                {pendingProposals.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="text-muted-foreground truncate text-xs"
                  >
                    <span
                      className={
                        p.proposedChange.riskLevel === "high"
                          ? "text-danger"
                          : p.proposedChange.riskLevel === "medium"
                            ? "text-warning"
                            : "text-success"
                      }
                    >
                      [{p.proposedChange.riskLevel === "high" ? "高" : p.proposedChange.riskLevel === "medium" ? "中" : "低"}风险]
                    </span>{" "}
                    {p.proposalId}
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="bg-brand/10 text-brand hover:bg-brand/20 mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              进入审批中心
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Harness 进化历史（最近评估记录，含报告） */}
      {evolutionLogs.length > 0 && (
        <div className="bg-card border-border rounded-2xl border p-6">
          <h2 className="text-foreground mb-4 text-base font-semibold">
            进化历史
          </h2>
          <div className="space-y-2.5">
            {evolutionLogs.map((log) => (
              <div
                key={log.id}
                className="border-border flex items-start gap-3 rounded-xl border px-4 py-3"
              >
                {/* 触发状态点 */}
                <span
                  className={
                    "mt-1.5 size-2 shrink-0 rounded-full " +
                    (log.triggered ? "bg-warning" : "bg-success")
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-foreground font-medium">
                      {log.triggered ? "已生成提案" : "指标健康"}
                    </span>
                    <span className="text-hint">
                      失败率 {(log.errorRate * 100).toFixed(1)}% · 日志 {log.totalLogs} 条
                    </span>
                    {log.provider ? (
                      <span className="bg-accent text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                        {log.provider} · {log.model}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-hint mt-1 truncate text-xs">
                    {log.triggered
                      ? `提案 ${log.proposalId ?? "—"}`
                      : log.reason ?? "—"}
                  </p>
                </div>
                <span className="text-hint shrink-0 text-[11px]">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
