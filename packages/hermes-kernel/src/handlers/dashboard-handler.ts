/**
 * Dashboard Handler — 仪表盘核心业务逻辑
 *
 * 从 apps/web/src/app/api/dashboard/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 * 此模块不直接 import Next.js，所有外部依赖通过 DI 注入
 */

// ==============================
// DI 接口
// ==============================

export interface DashboardHandlerDeps {
  prisma: {
    inquiry: { count: (args: any) => Promise<number>; findMany: (args: any) => Promise<any[]> };
    task: { count: (args: any) => Promise<number> };
    project: { count: (args: any) => Promise<number> };
    workflowRun: { findMany: (args: any) => Promise<any[]>; count: (args: any) => Promise<number>; groupBy: (args: any) => Promise<any[]> };
    marketIntelligence: { findMany: (args: any) => Promise<any[]> };
    industryPackInstallation: { count: (args: any) => Promise<number> };
    auditLog: { count: (args: any) => Promise<number> };
    harnessProposal: { count: (args: any) => Promise<number>; findFirst: (args: any) => Promise<any> };
    stepRun: { count: (args: any) => Promise<number> };
  };
}

// ==============================
// 时间工具（纯函数）
// ==============================

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// ==============================
// Dashboard Stats 聚合
// ==============================

const RISK_DIMENSION_LABELS: Record<string, string> = {
  currency: "汇率风险",
  tariff: "关税风险",
  logistics: "物流风险",
  competition: "竞争风险",
  market: "市场风险",
};

const MONITORED_SECTORS = ["电子", "纺织", "机械", "化工", "农业"];

export interface DashboardStatsInput {
  workspaceId: string;
}

export interface DashboardStats {
  todayInquiries: number;
  todayInquiriesChange: number;
  followingCustomers: number;
  pendingTasks: number;
  activeProjects: number;
  urgentCount: number;
  weeklyWorkflowRuns: Array<{ day: string; success: number; failed: number }>;
  dailyInquiryTrend: Array<{ date: string; count: number }>;
  activeClientAlerts: Array<{ companyName: string; countryFlag: string; country: string; recentCount: number; lastInquiryAt: string }>;
  geoDistribution: Array<{ countryCode: string; countryName: string; inquiryCount: number; intelCount: number; totalActivity: number; flag: string }>;
  riskRadar: Array<{ key: string; label: string; score: number; trend: string }>;
  industrySentiments: Array<{ sector: string; sentiment: string; score: number; confidence: number }>;
  predictiveIndicators: Array<{ metric: string; direction: string; confidence: number; changePercent: number }>;
  sparklines: { todayInquiries: number[]; followingCustomers: number[]; pendingTasks: number[]; activeProjects: number[] };
  trends: Record<string, { direction: string; percent: number }>;
  comparisons: Record<string, { metric: string; label: string; current: number; previous: number; changePercent: number }>;
}

export async function getDashboardStats(
  input: DashboardStatsInput,
  deps: DashboardHandlerDeps,
): Promise<DashboardStats> {
  const { workspaceId } = input;
  const { prisma: p } = deps;
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = startOfWeek(now);
  const trendStart = new Date(todayStart.getTime() - 13 * 86400000);
  const activeSince = new Date(todayStart.getTime() - 6 * 86400000);
  const geoStart = new Date(todayStart.getTime() - 29 * 86400000);

  const [
    todayCount, yesterdayCount, allInquiries, pendingCount, urgentCount,
    activeProjectCount, weekWorkflowRuns, trendInquiries, activeInquiries,
    geoInquiries, intelItems, prevWeekInquiryCount, recentWeekInquiryCount,
    recentWeekReplied, prevWeekReplied,
  ] = await Promise.all([
    p.inquiry.count({ where: { workspaceId, createdAt: { gte: todayStart } } }),
    p.inquiry.count({ where: { workspaceId, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    p.inquiry.findMany({ where: { workspaceId }, select: { companyName: true } }),
    p.task.count({ where: { workspaceId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    p.inquiry.count({ where: { workspaceId, priority: "high", replied: false } }),
    p.project.count({ where: { workspaceId, status: "active" } }),
    p.workflowRun.findMany({ where: { workspaceId, startedAt: { gte: weekStart } }, select: { status: true, startedAt: true } }),
    p.inquiry.findMany({ where: { workspaceId, createdAt: { gte: trendStart } }, select: { createdAt: true } }),
    p.inquiry.findMany({ where: { workspaceId, createdAt: { gte: activeSince } }, select: { companyName: true, fromCountry: true, countryFlag: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    p.inquiry.findMany({ where: { workspaceId, createdAt: { gte: geoStart } }, select: { fromCountry: true, countryFlag: true, companyName: true } }),
    p.marketIntelligence.findMany({ where: { workspaceId, publishedAt: { gte: geoStart } }, select: { type: true, title: true, summary: true, impactLevel: true, publishedAt: true } }),
    p.inquiry.count({ where: { workspaceId, createdAt: { gte: new Date(todayStart.getTime() - 14 * 86400000), lt: new Date(todayStart.getTime() - 7 * 86400000) } } }),
    p.inquiry.count({ where: { workspaceId, createdAt: { gte: new Date(todayStart.getTime() - 7 * 86400000) } } }),
    p.inquiry.count({ where: { workspaceId, createdAt: { gte: new Date(todayStart.getTime() - 7 * 86400000) }, replied: true } }),
    p.inquiry.count({ where: { workspaceId, createdAt: { gte: new Date(todayStart.getTime() - 14 * 86400000), lt: new Date(todayStart.getTime() - 7 * 86400000) }, replied: true } }),
  ]);

  // 客户去重
  const uniqueCompanies = new Set(allInquiries.map((i: any) => i.companyName).filter(Boolean));

  // 周工作流按天聚合
  const weeklyData = DAY_LABELS.map((day, index) => {
    const dayStart = new Date(weekStart.getTime() + index * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayRuns = weekWorkflowRuns.filter((r: any) => {
      if (!r.startedAt) return false;
      const t = new Date(r.startedAt).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    });
    return { day, success: dayRuns.filter((r: any) => r.status === "completed").length, failed: dayRuns.filter((r: any) => r.status === "failed").length };
  });

  // 14天询盘趋势
  const dailyInquiryTrend: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const count = trendInquiries.filter((inq: any) => {
      const t = new Date(inq.createdAt).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    }).length;
    const month = String(dayStart.getMonth() + 1).padStart(2, "0");
    const day = String(dayStart.getDate()).padStart(2, "0");
    dailyInquiryTrend.push({ date: `${month}-${day}`, count });
  }

  // 活跃客户预警
  const companyMap = new Map<string, any>();
  for (const inq of activeInquiries) {
    const key = inq.companyName;
    const existing = companyMap.get(key);
    if (existing) { existing.recentCount++; if (new Date(inq.createdAt) > new Date(existing.lastInquiryAt)) existing.lastInquiryAt = inq.createdAt; }
    else companyMap.set(key, { companyName: inq.companyName, countryFlag: inq.countryFlag, country: inq.fromCountry, recentCount: 1, lastInquiryAt: inq.createdAt });
  }
  const activeClientAlerts = Array.from(companyMap.values()).filter((c: any) => c.recentCount >= 2).sort((a: any, b: any) => b.recentCount - a.recentCount).slice(0, 5).map((c: any) => ({ ...c, lastInquiryAt: new Date(c.lastInquiryAt).toISOString() }));

  // 地理分布
  const geoMap = new Map<string, any>();
  for (const inq of geoInquiries) {
    const k = inq.fromCountry;
    if (geoMap.has(k)) geoMap.get(k).count++;
    else geoMap.set(k, { countryName: inq.fromCountry, countryFlag: inq.countryFlag, count: 1 });
  }
  const geoDistribution = Array.from(geoMap.entries()).map(([cc, d]) => ({ countryCode: cc, countryName: d.countryName, inquiryCount: d.count, intelCount: 0, totalActivity: d.count, flag: d.countryFlag })).sort((a, b) => b.totalActivity - a.totalActivity).slice(0, 20);

  // 风险雷达
  const typeGroups = new Map<string, { high: number; mid: number; low: number }>();
  const typeRecentCount = new Map<string, number>();
  const typePrevCount = new Map<string, number>();
  const recent7d = new Date(todayStart.getTime() - 7 * 86400000);
  for (const intel of intelItems) {
    const t = intel.type;
    if (!typeGroups.has(t)) typeGroups.set(t, { high: 0, mid: 0, low: 0 });
    const g = typeGroups.get(t)!;
    if (intel.impactLevel === "high") g.high++; else if (intel.impactLevel === "mid") g.mid++; else g.low++;
    if (new Date(intel.publishedAt) >= recent7d) typeRecentCount.set(t, (typeRecentCount.get(t) ?? 0) + 1);
    else typePrevCount.set(t, (typePrevCount.get(t) ?? 0) + 1);
  }
  const dimensions = ["currency", "tariff", "logistics", "competition", "market"];
  const riskRadar = dimensions.map((key) => {
    const g = typeGroups.get(key) ?? { high: 0, mid: 0, low: 0 };
    const total = g.high + g.mid + g.low;
    const score = total > 0 ? Math.round(((g.high * 1.0 + g.mid * 0.5 + g.low * 0.2) / total) * 100) : 0;
    const recent = typeRecentCount.get(key) ?? 0;
    const prev = typePrevCount.get(key) ?? 0;
    const trend = recent > prev ? "up" : recent < prev ? "down" : "stable";
    return { key, label: RISK_DIMENSION_LABELS[key] || key, score: Math.min(score, 100), trend };
  });

  // 行业情绪
  const sectorKeywords: Record<string, string[]> = {
    "电子": ["电子", "芯片", "半导体", "手机", "电脑", "集成电路", "PCB", "面板", "元件"],
    "纺织": ["纺织", "服装", "面料", "家纺", "纱线", "布料", "印染", "成衣"],
    "机械": ["机械", "设备", "机床", "工程机械", "泵", "阀门", "轴承", "模具"],
    "化工": ["化工", "化学", "塑料", "橡胶", "石化", "涂料", "添加剂", "树脂"],
    "农业": ["农业", "农产品", "粮食", "大豆", "水果", "蔬菜", "水产", "养殖"],
  };
  const bullishWords = ["增长", "上升", "利好", "回暖", "需求旺盛", "涨价", "扩张", "突破"];
  const bearishWords = ["下降", "萎缩", "风险", "制裁", "加税", "壁垒", "衰退", "过剩", "暴跌"];
  const sectorScores = new Map<string, { bullish: number; bearish: number; total: number }>();
  for (const s of MONITORED_SECTORS) sectorScores.set(s, { bullish: 0, bearish: 0, total: 0 });
  for (const intel of intelItems) {
    const text = `${intel.title} ${intel.summary}`;
    for (const s of MONITORED_SECTORS) {
      if (!(sectorKeywords[s] ?? []).some((kw: string) => text.includes(kw))) continue;
      const entry = sectorScores.get(s)!;
      entry.total++;
      if (bullishWords.some((w: string) => text.includes(w))) entry.bullish++;
      else if (bearishWords.some((w: string) => text.includes(w))) entry.bearish++;
    }
  }
  const industrySentiments = MONITORED_SECTORS.map((sector) => {
    const entry = sectorScores.get(sector)!;
    const score = entry.total > 0 ? Math.round(((entry.bullish - entry.bearish) / entry.total) * 100) : 0;
    const sentiment = score > 20 ? "bullish" : score < -20 ? "bearish" : "neutral";
    return { sector, sentiment, score, confidence: Math.min(entry.total / 10, 1.0) };
  });

  // 预测指示器
  const predictiveIndicators = [{
    metric: "inquiry_volume",
    direction: recentWeekInquiryCount > prevWeekInquiryCount ? "up" : recentWeekInquiryCount < prevWeekInquiryCount ? "down" : "stable",
    confidence: Math.min(Math.abs(recentWeekInquiryCount - prevWeekInquiryCount) / Math.max(prevWeekInquiryCount, 1), 0.95),
    changePercent: prevWeekInquiryCount > 0 ? Math.round(((recentWeekInquiryCount - prevWeekInquiryCount) / prevWeekInquiryCount) * 100) : 0,
  }];

  // 迷你趋势线
  const inquirySparkline = dailyInquiryTrend.slice(-7).map((p) => p.count);
  const sparklines = { todayInquiries: inquirySparkline, followingCustomers: [], pendingTasks: [], activeProjects: [] };

  function computeTrend(recent: number[], previous: number[]): { direction: string; percent: number } {
    const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const prevAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : 1;
    const percent = prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : 0;
    const direction = percent > 5 ? "up" : percent < -5 ? "down" : "stable";
    return { direction, percent };
  }
  const recentInquiryWeek = dailyInquiryTrend.slice(-7).map((p) => p.count);
  const prevInquiryWeek = dailyInquiryTrend.slice(0, 7).map((p) => p.count);
  const trends = {
    todayInquiries: computeTrend(recentInquiryWeek, prevInquiryWeek),
    followingCustomers: { direction: "stable", percent: 0 },
    pendingTasks: { direction: "stable", percent: 0 },
    activeProjects: { direction: "stable", percent: 0 },
  };

  function computeKpiComparison(metric: string, label: string, current: number, previous: number) {
    const changePercent = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
    return { metric, label, current, previous, changePercent };
  }
  const recentRate = recentWeekInquiryCount > 0 ? Math.round((recentWeekReplied / recentWeekInquiryCount) * 100) : 0;
  const prevRate = prevWeekInquiryCount > 0 ? Math.round((prevWeekReplied / prevWeekInquiryCount) * 100) : 0;
  const comparisons = {
    inquiryVolume: computeKpiComparison("inquiryVolume", "询盘量", recentWeekInquiryCount, prevWeekInquiryCount),
    responseRate: computeKpiComparison("responseRate", "回复率", recentRate, prevRate),
  };

  const todayInquiriesChange = yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : todayCount > 0 ? 100 : 0;

  return {
    todayInquiries: todayCount, todayInquiriesChange,
    followingCustomers: uniqueCompanies.size, pendingTasks: pendingCount, urgentCount, activeProjects: activeProjectCount,
    weeklyWorkflowRuns: weeklyData, dailyInquiryTrend, activeClientAlerts, geoDistribution, riskRadar,
    industrySentiments, predictiveIndicators, sparklines, trends, comparisons,
  };
}

// ==============================
// Dashboard Overview 聚合
// ==============================

export interface DashboardOverviewInput {
  workspaceId: string;
  period: string;
}

export async function getDashboardOverview(
  input: DashboardOverviewInput,
  deps: DashboardHandlerDeps,
): Promise<any> {
  const { workspaceId } = input;
  const periodDays = input.period === "30d" ? 30 : 7;
  const now = new Date();
  const { prisma: p } = deps;
  const currentStart = new Date(now.getTime() - periodDays * 86400000);
  const prevStart = new Date(now.getTime() - 2 * periodDays * 86400000);
  const prevEnd = currentStart;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  // Helper: active workspaces
  const getActiveWorkspaces = async (start: Date, end: Date) => {
    const list = await p.workflowRun.groupBy({ by: ["workspaceId"], where: { createdAt: { gte: start, lte: end } } });
    return list.length;
  };
  const getAvgDailyTasks = async (start: Date, end: Date) => {
    const c = await p.workflowRun.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } });
    return c / periodDays;
  };
  const getWorkflowRunsByStatus = async () => {
    const groups = await p.workflowRun.groupBy({ by: ["status"], where: { workspaceId, createdAt: { gte: currentStart } }, _count: { status: true } });
    const dist: any = { completed: 0, failed: 0, running: 0, cancelled: 0 };
    groups.forEach((g: any) => { if (dist[g.status] !== undefined) dist[g.status] = g._count.status; else dist.running += g._count.status; });
    return dist;
  };
  const getInstalledPackCount = () => p.industryPackInstallation.count({ where: { workspaceId, status: "installed" } });

  const getRate = async (actionOk: string, actionFail: string, start: Date, end: Date) => {
    const [ok, fail] = await Promise.all([
      p.auditLog.count({ where: { workspaceId, action: actionOk, createdAt: { gte: start, lte: end } } }),
      p.auditLog.count({ where: { workspaceId, action: actionFail, createdAt: { gte: start, lte: end } } }),
    ]);
    return ok + fail > 0 ? ok / (ok + fail) : 1.0;
  };
  const getTaskCompletionRate = async (start: Date, end: Date) => {
    const [c, t] = await Promise.all([
      p.workflowRun.count({ where: { workspaceId, status: "completed", createdAt: { gte: start, lte: end } } }),
      p.workflowRun.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } }),
    ]);
    return t > 0 ? c / t : 1.0;
  };

  const getProposalAdoptionRate = async (start: Date, end: Date) => {
    const [t, a] = await Promise.all([
      p.harnessProposal.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } }),
      p.harnessProposal.count({ where: { workspaceId, status: { in: ["active", "canary", "rolled_back", "deprecated"] }, createdAt: { gte: start, lte: end } } }),
    ]);
    return t > 0 ? a / t : 1.0;
  };

  const getDailyWorkflowRuns = async () => {
    const runs = await p.workflowRun.findMany({ where: { workspaceId, createdAt: { gte: currentStart } }, select: { createdAt: true } });
    const counts: Record<string, number> = {};
    for (let i = 0; i < periodDays; i++) { const d = new Date(now.getTime() - i * 86400000); counts[d.toISOString().slice(5, 10)] = 0; }
    runs.forEach((r: any) => { const key = new Date(r.createdAt).toISOString().slice(5, 10); if (key in counts) counts[key]++; });
    return Object.entries(counts).map(([date, count]) => ({ date, count })).reverse();
  };

  const [
    activeWorkspaces, avgDailyTasks, workflowRunsByStatus, installedPackCount,
    proposalApprovalRate, rollbackRate, taskCompletionRate, connectorSuccessRate,
    avgEventLatencyMs, humanInterventionRate, receiptCompletenessRate,
    proposalAdoptionRate, canarySuccessRate, avgMemoryHitRate, dailyWorkflowRuns,
  ] = await Promise.all([
    getActiveWorkspaces(new Date(now.getTime() - 7 * 86400000), now),
    getAvgDailyTasks(currentStart, now),
    getWorkflowRunsByStatus(),
    getInstalledPackCount(),
    getRate("approval.granted", "approval.rejected", thirtyDaysAgo, now),
    getRate("harness.rollback.completed", "harness.rollback.aborted", thirtyDaysAgo, now),
    getTaskCompletionRate(currentStart, now),
    getRate("email.sent", "email.failed", currentStart, now),
    (async () => { const runs = await p.workflowRun.findMany({ where: { workspaceId, status: "completed", durationMs: { not: null }, createdAt: { gte: currentStart, lte: now } }, select: { durationMs: true } }); return runs.length > 0 ? runs.reduce((s: number, r: any) => s + (r.durationMs || 0), 0) / runs.length : 1200; })(),
    (async () => { const [reqs, total] = await Promise.all([p.auditLog.count({ where: { workspaceId, action: "approval.requested", createdAt: { gte: currentStart, lte: now } } }), p.workflowRun.count({ where: { workspaceId, createdAt: { gte: currentStart, lte: now } } })]); return total > 0 ? reqs / total : 0.0; })(),
    (async () => { const [c, w] = await Promise.all([p.stepRun.count({ where: { workspaceId, status: "completed", createdAt: { gte: currentStart, lte: now } } }), p.stepRun.count({ where: { workspaceId, status: "completed", outputData: { not: null }, createdAt: { gte: currentStart, lte: now } } })]); return c > 0 ? w / c : 1.0; })(),
    getProposalAdoptionRate(thirtyDaysAgo, now),
    getRate("canary.promoted", "canary.aborted", thirtyDaysAgo, now),
    (async () => { const [cc, ac] = await Promise.all([p.auditLog.count({ where: { workspaceId, action: "EvalCompleted", createdAt: { gte: thirtyDaysAgo, lte: now } } }), p.auditLog.count({ where: { workspaceId, action: "EvalAnomalyDetected", detail: { contains: "memoryHitRate" }, createdAt: { gte: thirtyDaysAgo, lte: now } } })]); return cc > 0 ? Math.max(0.70, 1.0 - (ac / cc) * 0.30) : 0.88; })(),
    getDailyWorkflowRuns(),
  ]);

  const [prevActiveWorkspaces, prevAvgDailyTasks, prevProposalApprovalRate, prevRollbackRate, prevTaskCompletionRate,
    prevConnectorSuccessRate, prevAvgEventLatencyMs, prevHumanInterventionRate, prevReceiptCompletenessRate,
    prevProposalAdoptionRate, prevCanarySuccessRate, prevAvgMemoryHitRate,
  ] = await Promise.all([
    getActiveWorkspaces(new Date(currentStart.getTime() - 7 * 86400000), currentStart),
    getAvgDailyTasks(prevStart, prevEnd),
    getRate("approval.granted", "approval.rejected", sixtyDaysAgo, thirtyDaysAgo),
    getRate("harness.rollback.completed", "harness.rollback.aborted", sixtyDaysAgo, thirtyDaysAgo),
    getTaskCompletionRate(prevStart, prevEnd),
    getRate("email.sent", "email.failed", prevStart, prevEnd),
    (async () => { const runs = await p.workflowRun.findMany({ where: { workspaceId, status: "completed", durationMs: { not: null }, createdAt: { gte: prevStart, lte: prevEnd } }, select: { durationMs: true } }); return runs.length > 0 ? runs.reduce((s: number, r: any) => s + (r.durationMs || 0), 0) / runs.length : 1200; })(),
    (async () => { const [reqs, total] = await Promise.all([p.auditLog.count({ where: { workspaceId, action: "approval.requested", createdAt: { gte: prevStart, lte: prevEnd } } }), p.workflowRun.count({ where: { workspaceId, createdAt: { gte: prevStart, lte: prevEnd } } })]); return total > 0 ? reqs / total : 0.0; })(),
    (async () => { const [c, w] = await Promise.all([p.stepRun.count({ where: { workspaceId, status: "completed", createdAt: { gte: prevStart, lte: prevEnd } } }), p.stepRun.count({ where: { workspaceId, status: "completed", outputData: { not: null }, createdAt: { gte: prevStart, lte: prevEnd } } })]); return c > 0 ? w / c : 1.0; })(),
    getProposalAdoptionRate(sixtyDaysAgo, thirtyDaysAgo),
    getRate("canary.promoted", "canary.aborted", sixtyDaysAgo, thirtyDaysAgo),
    (async () => { const [cc, ac] = await Promise.all([p.auditLog.count({ where: { workspaceId, action: "EvalCompleted", createdAt: { gte: sixtyDaysAgo, lte: thirtyDaysAgo } } }), p.auditLog.count({ where: { workspaceId, action: "EvalAnomalyDetected", detail: { contains: "memoryHitRate" }, createdAt: { gte: sixtyDaysAgo, lte: thirtyDaysAgo } } })]); return cc > 0 ? Math.max(0.70, 1.0 - (ac / cc) * 0.30) : 0.88; })(),
  ]);

  return {
    platform: { activeWorkspaces, avgDailyTasks, workflowRunsByStatus, installedPackCount, proposalApprovalRate, rollbackRate },
    execution: { taskCompletionRate, connectorSuccessRate, avgEventLatencyMs, humanInterventionRate, receiptCompletenessRate },
    evolution: { proposalAdoptionRate, canarySuccessRate, avgMemoryHitRate },
    prev: {
      platform: { activeWorkspaces: prevActiveWorkspaces, avgDailyTasks: prevAvgDailyTasks, installedPackCount, proposalApprovalRate: prevProposalApprovalRate, rollbackRate: prevRollbackRate },
      execution: { taskCompletionRate: prevTaskCompletionRate, connectorSuccessRate: prevConnectorSuccessRate, avgEventLatencyMs: prevAvgEventLatencyMs, humanInterventionRate: prevHumanInterventionRate, receiptCompletenessRate: prevReceiptCompletenessRate },
      evolution: { proposalAdoptionRate: prevProposalAdoptionRate, canarySuccessRate: prevCanarySuccessRate, avgMemoryHitRate: prevAvgMemoryHitRate },
    },
    dailyWorkflowRuns,
    updatedAt: new Date().toISOString(),
  };
}
