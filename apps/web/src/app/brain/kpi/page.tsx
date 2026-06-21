"use client";

import { getKPIData } from "@/lib/api/brain";
import { useBrainFetch } from "@/hooks/use-brain-fetch";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { Cpu, Zap, ShieldAlert, CheckCircle, BarChart3, TrendingUp, History, CircleDot } from "lucide-react";
import { motion } from "framer-motion";

interface StatItem {
  title: string;
  value: string;
  change: string;
  desc: string;
  status: string;
}

interface HealthMetric {
  name: string;
  current: string;
  target: string;
  status: string;
}

interface EvolutionSummary {
  proposalsCreated: number;
  autoApproved: number;
  rollbackEvents: number;
  canarySuccessRate: number;
}

interface FunnelData {
  inquiries: number;
  intentions: number;
  quotations: number;
  deals: number;
}

interface KPIDataResponse {
  stats: StatItem[];
  healthMetrics: HealthMetric[];
  evolutionSummary: EvolutionSummary;
  funnel: FunnelData;
  updatedAt: string;
}

export default function KpiPage() {
  // 使用封装好的公共中枢 Hook，完全物理隔离 workspace store
  const { data, loading, error } = useBrainFetch<KPIDataResponse>(
    getKPIData,
    "default"
  );

  const statsIcons: Record<string, any> = {
    "自主演化率 (Self-Evolution Rate)": Cpu,
    "执行可靠性 (Execution Robustness)": Zap,
    "高危拦截率 (Guardrail Interception)": ShieldAlert,
  };

  const statsColors: Record<string, string> = {
    "自主演化率 (Self-Evolution Rate)": "from-purple-500/20 to-indigo-500/20 border-purple-500/30 text-purple-400",
    "执行可靠性 (Execution Robustness)": "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400",
    "高危拦截率 (Guardrail Interception)": "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400",
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-8 max-w-6xl mx-auto pb-12">
          <PageHeader title="系统 KPI 指标监控" description="正在载入中枢核心指标大盘..." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} variant="card" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  if (error || !data) {
    return (
      <PageTransition>
        <div className="space-y-8 max-w-6xl mx-auto pb-12">
          <PageHeader title="系统 KPI 指标监控" description="核心指标大盘" />
          <div className="text-center py-12 bg-card/30 border border-border rounded-2xl backdrop-blur-sm">
            <p className="text-destructive text-sm font-medium">数据加载失败</p>
            <p className="text-muted-foreground text-xs mt-1">{error}</p>
          </div>
        </div>
      </PageTransition>
    );
  }

  // 漏斗计算百分比
  const funnelSteps = [
    { label: "询盘入站 (Inquiries)", value: data.funnel.inquiries, pct: 100, color: "bg-[#6D5EF9]" },
    { label: "形成意向 (Intentions)", value: data.funnel.intentions, pct: Math.round((data.funnel.intentions / data.funnel.inquiries) * 100), color: "bg-indigo-500" },
    { label: "发放报价 (Quotations)", value: data.funnel.quotations, pct: Math.round((data.funnel.quotations / data.funnel.inquiries) * 100), color: "bg-blue-500" },
    { label: "最终成交 (Deals)", value: data.funnel.deals, pct: Math.round((data.funnel.deals / data.funnel.inquiries) * 100), color: "bg-emerald-500" },
  ];

  return (
    <PageTransition>
      <div className="space-y-8 max-w-6xl mx-auto pb-12 select-none">
        <PageHeader
          title="系统 KPI 指标监控"
          description="Hermes 控制内核自演化进化指标、安全屏障拦截率与运行时健康指标大盘"
        />

        {/* 核心指标网格 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.stats.map((stat, i) => {
            const Icon = statsIcons[stat.title] || Cpu;
            const colorClass = statsColors[stat.title] || "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-400";
            return (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                className={`bg-gradient-to-br ${colorClass.split(" ")[0]} ${colorClass.split(" ")[1]} border ${colorClass.split(" ")[2]} rounded-2xl p-6 relative overflow-hidden backdrop-blur-md shadow-lg`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
                    {stat.title}
                  </span>
                  <div className="p-2 rounded-xl bg-background/50 border border-white/5">
                    <Icon className={`size-5 ${colorClass.split(" ")[3]}`} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold font-mono text-foreground">{stat.value}</span>
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
                    <TrendingUp className="size-3" />
                    {stat.change}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed mt-2">{stat.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* 下方指标：左侧系统健康，右侧外贸漏斗 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左侧：系统自愈与健康监控 */}
          <div className="bg-card/50 border border-border/60 rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-foreground font-semibold text-xs uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-border/40 pb-2">
              <CheckCircle className="size-4 text-emerald-400" />
              自愈与健康监控
            </h3>
            <div className="space-y-4">
              {data.healthMetrics.map((metric) => (
                <div key={metric.name} className="flex justify-between items-center py-2.5 border-b border-border/40 last:border-0">
                  <span className="text-muted-foreground text-xs font-medium">{metric.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-foreground font-mono text-xs font-semibold">{metric.current}</span>
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-semibold px-2 py-0.5 rounded-full">
                      达标 (目标 {metric.target})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 演化统计子版块 */}
            <div className="mt-8 pt-6 border-t border-border/40">
              <h4 className="text-foreground font-semibold text-[10px] uppercase tracking-wider mb-4 flex items-center gap-2">
                <BarChart3 className="size-4 text-indigo-400" />
                自演化提案统计 (本月)
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-background/40 border border-border/50 rounded-xl p-3.5">
                  <span className="text-muted-foreground text-[9px] block mb-0.5">生成提案</span>
                  <span className="text-lg font-bold font-mono text-foreground">{data.evolutionSummary.proposalsCreated}</span>
                </div>
                <div className="bg-background/40 border border-border/50 rounded-xl p-3.5">
                  <span className="text-muted-foreground text-[9px] block mb-0.5">灰度通过</span>
                  <span className="text-lg font-bold font-mono text-foreground">{data.evolutionSummary.autoApproved}</span>
                </div>
                <div className="bg-background/40 border border-border/50 rounded-xl p-3.5">
                  <span className="text-muted-foreground text-[9px] block mb-0.5">触发回滚</span>
                  <span className="text-lg font-bold font-mono text-foreground">{data.evolutionSummary.rollbackEvents}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：高颜值外贸漏斗模型 */}
          <div className="bg-card/50 border border-border/60 rounded-2xl p-6 backdrop-blur-sm flex flex-col justify-between">
            <div>
              <h3 className="text-foreground font-semibold text-xs uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-border/40 pb-2">
                <CircleDot className="size-4 text-[#6D5EF9]" />
                外贸转化漏斗 (Industry Funnel)
              </h3>
              
              <div className="space-y-4 mt-6">
                {funnelSteps.map((step, idx) => (
                  <div key={step.label} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6D5EF9]/80" />
                        {step.label}
                      </span>
                      <div className="space-x-2 text-right">
                        <span className="text-foreground font-semibold font-mono">{step.value}</span>
                        {idx > 0 && (
                          <span className="text-[10px] text-muted-foreground">({step.pct}%)</span>
                        )}
                      </div>
                    </div>
                    {/* 漏斗宽窄变化进度条，首层 100%，后面逐渐收窄，完美呈现漏斗视觉 */}
                    <div className="h-2 w-full bg-accent/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                        style={{ width: `${step.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-8 text-muted-foreground text-[10px] bg-background/30 p-3 rounded-xl border border-border/30">
              <History className="size-3.5 shrink-0" />
              <span>数据来源于外贸特种行业包，指标由 canary 巡检分析以及 audit 归档统计定时生成，用以反映大模型整体报价及跟进收益。</span>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
