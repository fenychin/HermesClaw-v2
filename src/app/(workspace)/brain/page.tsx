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
import { useBrainStats } from "@/hooks/use-brain-stats";
import { Plus, Check, Play as PlayIcon, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const loadMemories = useMemoryStore((s) => s.loadMemories);
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const connectors = useConnectorStore((s) => s.connectors);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);
  const harnessProposals = useTradeStore((s) => s.harnessProposals);
  const loadProposals = useTradeStore((s) => s.loadProposals);

  // 引入脑指标 Hook
  const { data: stats, refetch: refetchStats } = useBrainStats();

  // 知识盲区补充弹窗状态
  const [activeGap, setActiveGap] = useState<{
    id: string;
    description: string;
    missingType: "mid" | "long";
    suggestedAction: string;
  } | null>(null);
  const [gapContent, setGapContent] = useState("");
  const [gapType, setGapType] = useState<"mid" | "long">("mid");
  const [isSubmittingGap, setIsSubmittingGap] = useState(false);

  // 提交补充知识
  const handleAddKnowledge = async () => {
    if (!activeGap || !gapContent.trim()) return;
    setIsSubmittingGap(true);
    try {
      const keywords = activeGap.description.includes("沙特")
        ? ["沙特", "外贸合规"]
        : activeGap.description.includes("俄罗斯")
          ? ["俄罗斯", "物流运价"]
          : ["知识盲区"];

      await apiClient.createMemory({
        type: gapType,
        summary: activeGap.description.slice(0, 80),
        content: gapContent.trim(),
        tags: keywords,
        source: "manual",
        confidence: 0.9,
      });

      // 刷新脑统计数据与记忆库
      await Promise.all([refetchStats(), loadMemories()]);
      setActiveGap(null);
      setGapContent("");
    } catch (err) {
      console.error("补充知识失败", err);
    } finally {
      setIsSubmittingGap(false);
    }
  };

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

  // 挂载时加载提案、技能、连接器、记忆，使概览计数与待审批预览准确
  useEffect(() => {
    loadMemories();
    loadProposals();
    loadSkills();
    loadConnectors();
  }, [loadMemories, loadProposals, loadSkills, loadConnectors]);

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

      {/* Harness 评估与知识盲区连通挂件 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 左栏：记忆健康度与命中率趋势 (占用 1 栏) */}
        <div className="bg-card border-border rounded-2xl border p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-brand/10 p-1.5 rounded-lg">
                <TrendingUp className="text-brand size-4" />
              </div>
              <h3 className="text-foreground text-sm font-semibold">记忆命中率与健康度</h3>
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-foreground">
                {stats?.hitRate ?? "84.6"}%
              </span>
              <span className="text-success text-xs font-semibold flex items-center gap-0.5">
                ↑ 2.1%
              </span>
            </div>
            <p className="text-hint text-xs mt-1">最近 72 小时演化引擎运行评估</p>
          </div>

          {/* SVG 渐变折线图 */}
          <div className="my-4 h-14 w-full flex items-center justify-between gap-4">
            <div className="flex-1 h-full">
              <svg className="w-full h-full" viewBox="0 0 160 50" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C5CFF" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#7C5CFF" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* 渐变填充区域 */}
                <path
                  d={`M 10,50 L 10,${50 - (((stats?.hitRateTrend?.[0] ?? 80.2) - 60) / 40) * 35 - 5} 
                     ${(stats?.hitRateTrend || [80.2, 81.5, 80.9, 83.4, 82.8, 83.5, 84.6])
                       .map((val, idx) => {
                         const x = (idx / 6) * 140 + 10;
                         const y = 50 - ((val - 60) / 40) * 35 - 5;
                         return `L ${x},${y}`;
                       })
                       .join(" ")} L 150,50 Z`}
                  fill="url(#chartGradient)"
                />
                {/* 趋势折线 */}
                <polyline
                  fill="none"
                  stroke="#7C5CFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={(stats?.hitRateTrend || [80.2, 81.5, 80.9, 83.4, 82.8, 83.5, 84.6])
                    .map((val, idx) => {
                      const x = (idx / 6) * 140 + 10;
                      const y = 50 - ((val - 60) / 40) * 35 - 5;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
                {/* 最后一个数据点的脉冲特效 */}
                <circle
                  cx={150}
                  cy={50 - (((stats?.hitRate ?? 84.6) - 60) / 40) * 35 - 5}
                  r="3.5"
                  className="fill-brand stroke-card"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            
            <div className="text-right shrink-0">
              <span className="text-brand text-xs font-semibold block">节省 Token</span>
              <span className="text-foreground text-sm font-bold block mt-0.5">
                {stats?.tokensSaved?.toLocaleString("zh-CN") ?? "53,400"}
              </span>
            </div>
          </div>

          <div className="text-hint text-[11px] leading-relaxed border-t border-border/50 pt-2 flex items-center justify-between">
            <span>短期会话转化为中期/长期事实</span>
            <span className="text-brand font-medium">健康度：极佳</span>
          </div>
        </div>

        {/* 右侧：知识盲区与诊断清单 (占用 2 栏) */}
        <div className="bg-card border-border rounded-2xl border p-5 col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
                <span className="flex size-2 rounded-full bg-danger animate-pulse" />
                评估诊断：系统知识盲区 (Knowledge Gaps)
              </h3>
              <span className="text-hint text-xs">基于近期未命中事实自动诊断</span>
            </div>

            <div className="space-y-3">
              {(stats?.knowledgeGaps || []).map((gap) => (
                <div
                  key={gap.id}
                  className={cn(
                    "border rounded-xl p-3 flex items-center justify-between gap-4 transition-colors",
                    gap.resolved
                      ? "bg-accent/20 border-border/40 opacity-70"
                      : "bg-danger/[0.02] border-danger/10 hover:bg-danger/[0.04]"
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                          gap.resolved
                            ? "bg-success/10 text-success"
                            : "bg-danger/10 text-danger"
                        )}
                      >
                        {gap.resolved ? "已补齐" : "待补充"}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        诊断时间: {formatDateTime(gap.detectedAt)}
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs truncate font-medium",
                      gap.resolved ? "text-hint line-through" : "text-foreground"
                    )}>
                      {gap.description}
                    </p>
                  </div>

                  {gap.resolved ? (
                    <div className="flex shrink-0 items-center gap-1 text-success text-xs font-semibold">
                      <Check className="size-3.5" />
                      已学习
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveGap(gap);
                        setGapType(gap.missingType);
                        setGapContent("");
                      }}
                      className="bg-brand/10 text-brand hover:bg-brand/20 shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <Plus className="size-3" />
                      补充知识
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <p className="text-hint text-[10px] mt-4 leading-normal">
            * 补齐盲区知识后，演化引擎会在下一次模型调用或决策日志生成时，自动加载该记忆块。
          </p>
        </div>
      </div>

      {/* 补充知识 Modal */}
      {activeGap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border-border w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            {/* 头部 */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-foreground text-base font-bold">补充知识库以修补盲区</h3>
                <p className="text-hint mt-1 text-xs">
                  诊断模块: {activeGap.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveGap(null)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 表单内容 */}
            <div className="space-y-4 text-left">
              {/* 记忆类型选择 */}
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">存储记忆层级</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGapType("mid")}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors",
                      gapType === "mid"
                        ? "bg-brand/10 border-brand text-brand"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    中期记忆 (项目/客户级)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGapType("long")}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors",
                      gapType === "long"
                        ? "bg-brand/10 border-brand text-brand"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    长期记忆 (组织级 SOP/规则)
                  </button>
                </div>
              </div>

              {/* 建议动作 */}
              <div className="bg-accent/40 rounded-lg p-3 text-xs text-muted-foreground border border-border/50">
                <span className="text-brand font-semibold block mb-0.5">建议操作提示：</span>
                {activeGap.suggestedAction}
              </div>

              {/* 详细事实内容 */}
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">详细知识事实内容 (必填)</label>
                <textarea
                  value={gapContent}
                  onChange={(e) => setGapContent(e.target.value)}
                  rows={4}
                  className="bg-background border-border text-foreground placeholder:text-hint w-full rounded-xl border p-3 text-xs outline-none focus:border-brand transition-colors"
                  placeholder="请输入真实的业务规则、关税政策、运价表或者是合规安全把关事实，以便智能体在会话中引用学习..."
                />
              </div>

              {/* 建议标签 */}
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold block">建议注入的标签</label>
                <div className="flex gap-1.5">
                  {(activeGap.description.includes("沙特")
                    ? ["沙特", "外贸合规", "SOP"]
                    : activeGap.description.includes("俄罗斯")
                      ? ["俄罗斯", "物流运价", "圣彼得堡"]
                      : ["知识盲区"]
                  ).map((t) => (
                    <span key={t} className="bg-accent text-hint text-[10px] rounded px-2 py-0.5">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部操作 */}
            <div className="flex justify-end gap-3 border-t border-border/50 pt-4">
              <button
                type="button"
                onClick={() => setActiveGap(null)}
                className="bg-accent text-foreground hover:bg-accent/80 rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSubmittingGap || !gapContent.trim()}
                onClick={handleAddKnowledge}
                className="bg-brand text-white hover:bg-brand/90 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingGap && <Loader2 className="size-3 animate-spin" />}
                写入知识库并学习
              </button>
            </div>
          </div>
        </div>
      )}

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
