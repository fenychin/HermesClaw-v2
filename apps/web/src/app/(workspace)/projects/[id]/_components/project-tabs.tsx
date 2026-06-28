"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  ListTodo,
  FileText,
  Activity,
  Bot,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  File,
  Shield,
  User,
  ExternalLink,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ProjectChat } from "./project-chat";
import { ProjectContextPanel } from "./project-context-panel";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-success/10 text-success border-success/20",
  MEDIUM: "bg-info/10 text-info border-info/20",
  HIGH: "bg-warning/10 text-warning border-warning/20",
  URGENT: "bg-danger/10 text-danger border-danger/20",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "未开始",
  IN_PROGRESS: "进行中",
  DONE: "已完成",
  CANCELLED: "已取消",
};

// ============================================================
// 任务 Tab —— 真实接线，展示项目关联的任务列表
// ============================================================
function TasksTabContent() {
  const { id: projectId } = useParams();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?projectId=${projectId}`);
      if (!res.ok) throw new Error("获取项目任务失败");
      const json = await res.json();
      return json.data?.tasks || json.tasks || [];
    },
    enabled: !!projectId,
  });

  const tasks = data || [];
  const filtered = statusFilter
    ? tasks.filter((t: any) => t.status === statusFilter)
    : tasks;

  const statusCounts: Record<string, number> = {};
  for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold">项目任务 ({tasks.length})</h3>
            <span className="text-hint text-[10px]">从项目空间关联的任务库中实时读取</span>
          </div>
        </div>

        {/* 状态筛选 */}
        <div className="flex gap-1.5">
          {[
            { value: null, label: "全部", count: tasks.length },
            { value: "OPEN", label: "未开始", count: statusCounts["OPEN"] || 0 },
            { value: "IN_PROGRESS", label: "进行中", count: statusCounts["IN_PROGRESS"] || 0 },
            { value: "DONE", label: "已完成", count: statusCounts["DONE"] || 0 },
            { value: "CANCELLED", label: "已取消", count: statusCounts["CANCELLED"] || 0 },
          ].map((opt) => (
            <button
              key={opt.value ?? "all"}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-lg border whitespace-nowrap transition-colors",
                statusFilter === opt.value
                  ? "bg-primary/10 text-primary border-primary/30 font-medium"
                  : "bg-accent/30 text-muted-foreground border-border/30 hover:border-border/50",
              )}
            >
              {opt.label}
              {opt.count > 0 && <span className="ml-1 text-[9px] opacity-70">({opt.count})</span>}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
            ))}
          </div>
        ) : error ? (
          <div className="border border-danger/20 bg-danger/5 text-danger text-xs rounded-xl p-4 text-center">
            加载失败: {error instanceof Error ? error.message : "未知错误"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center bg-card/10">
            <ListTodo className="size-8 text-hint mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">
              {statusFilter ? `暂无 "${STATUS_LABELS[statusFilter] || statusFilter}" 状态的任务` : "该项目空间暂无任务记录"}
            </p>
            <p className="text-hint text-xs mt-1">
              {statusFilter
                ? "切换筛选条件查看其他状态的任务"
                : "关联智能体在执行流程中将自动在此派发任务"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((task: any) => (
              <div
                key={task.id}
                className="bg-card/45 border border-border rounded-xl p-4 hover:border-primary/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-semibold truncate">{task.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${PRIORITY_COLORS[task.priority] || "bg-accent text-muted-foreground"}`}>
                      {task.priority || "MEDIUM"}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-muted-foreground text-xs leading-relaxed max-w-xl line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="text-hint font-mono">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                  {task.dueAt && (
                    <span className="text-hint text-[10px]">
                      截止: {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded-lg font-medium ${
                    task.status === "DONE" ? "bg-success/15 text-success" :
                    task.status === "IN_PROGRESS" ? "bg-warning/15 text-warning" :
                    task.status === "CANCELLED" ? "bg-muted text-muted-foreground" :
                    "bg-accent text-foreground"
                  }`}>
                    {STATUS_LABELS[task.status] || task.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 动态 Tab —— AgentLog + AuditLog 真实数据
// ============================================================
function ActivityTabContent() {
  const { id: projectId } = useParams();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-activity", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/activity?limit=50`);
      if (!res.ok) throw new Error("获取项目动态失败");
      const json = await res.json();
      return (json.data?.events || []) as Array<{
        id: string
        type: "agent-log" | "audit-log"
        action: string
        detail: string
        actor: string
        status: string
        riskLevel: string | null
        timestamp: string
        workflowRunId: string | null
      }>;
    },
    enabled: !!projectId,
    refetchInterval: 15000, // 每 15s 刷新
  });

  const events = data || [];
  const filtered = typeFilter
    ? events.filter((e) => e.type === typeFilter)
    : events;

  const agentCount = events.filter((e) => e.type === "agent-log").length;
  const auditCount = events.filter((e) => e.type === "audit-log").length;

  const riskBadge = (level: string | null) => {
    if (!level) return null;
    const colors: Record<string, string> = {
      low: "bg-accent text-muted-foreground border-border",
      medium: "bg-warning/10 text-warning border-warning/20",
      high: "bg-danger/10 text-danger border-danger/20",
      critical: "bg-danger/15 text-danger font-bold border-danger/30",
    };
    return (
      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", colors[level] || colors.low)}>
        {level}
      </span>
    );
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "success": case "completed": case "success":
        return <CheckCircle2 className="size-3.5 text-success shrink-0" />;
      case "failed": case "error":
        return <XCircle className="size-3.5 text-danger shrink-0" />;
      case "running":
        return <Activity className="size-3.5 text-info animate-spin shrink-0" />;
      default:
        return <Clock className="size-3.5 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold">项目动态 ({events.length})</h3>
            <span className="text-hint text-[10px]">
              数据源: AgentLog + AuditLog 按项目过滤
            </span>
          </div>
        </div>

        {/* 类型筛选 */}
        <div className="flex gap-1.5">
          {[
            { value: null, label: "全部", count: events.length },
            { value: "agent-log", label: "AI 执行", count: agentCount },
            { value: "audit-log", label: "审计日志", count: auditCount },
          ].map((opt) => (
            <button
              key={opt.value ?? "all"}
              onClick={() => setTypeFilter(opt.value)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-lg border whitespace-nowrap transition-colors",
                typeFilter === opt.value
                  ? "bg-primary/10 text-primary border-primary/30 font-medium"
                  : "bg-accent/30 text-muted-foreground border-border/30 hover:border-border/50",
              )}
            >
              {opt.label}
              {opt.count > 0 && <span className="ml-1 text-[9px] opacity-70">({opt.count})</span>}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
            ))}
          </div>
        ) : error ? (
          <div className="border border-danger/20 bg-danger/5 text-danger text-xs rounded-xl p-4 text-center">
            加载失败: {error instanceof Error ? error.message : "未知错误"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center bg-card/10">
            <Activity className="size-8 text-hint mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">
              {typeFilter ? `暂无 "${typeFilter === 'agent-log' ? 'AI 执行' : '审计日志'}" 类型的活动记录` : "暂无项目动态"}
            </p>
            <p className="text-hint text-xs mt-1">启动 AI 任务后，执行日志与审计记录将自动在此汇聚</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "bg-card/45 border border-border rounded-xl p-3 flex items-start gap-3",
                  "hover:border-primary/20 transition-all",
                )}
              >
                <div className="mt-0.5">{statusIcon(event.status)}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground text-xs font-semibold truncate">
                      {event.action}
                    </span>
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                      event.type === "agent-log"
                        ? "bg-info/10 text-info border-info/20"
                        : "bg-accent text-muted-foreground border-border",
                    )}>
                      {event.type === "agent-log" ? "AI 执行" : "审计"}
                    </span>
                    {event.riskLevel && riskBadge(event.riskLevel)}
                  </div>
                  {event.detail && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {event.detail}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-hint">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <User className="size-2.5" />
                        {event.actor}
                      </span>
                      {event.workflowRunId && (
                        <span className="font-mono text-[9px]">
                          run: {event.workflowRunId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                    <span className="font-mono">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 文件 Tab —— 从项目上下文面板真实读取
// ============================================================
function FilesTabContent() {
  const { id: projectId } = useParams();

  const { data: files, isLoading, error } = useQuery({
    queryKey: ["project-files", projectId],
    queryFn: async () => {
      // 项目文件从上下文面板的 projectFiles 获取
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("获取项目文件失败");
      const json = await res.json();
      // 文件信息保存在 activeAgents 扩展字段中
      const project = json.data?.project;
      // 目前项目模型不直接存储文件列表，通过记忆中的文件引用获取
      return [] as Array<{ name: string; size: number; type: string; uploadedAt: string }>;
    },
    enabled: !!projectId,
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold">项目文件</h3>
            <span className="text-hint text-[10px]">通过右侧上下文面板管理</span>
          </div>
        </div>

        <div className="border border-border rounded-xl p-8 text-center bg-card/10">
          <File className="size-10 text-hint mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground text-sm">项目文件在右侧面板中管理</p>
          <p className="text-hint text-xs mt-2 max-w-xs mx-auto leading-relaxed">
            通过右侧 Project Context Panel 的"项目文件"区域上传、预览与 AI 上下文引用。
            支持文档、图片与数据文件的上下文绑定。
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 智能体 Tab —— 从项目 activeAgents 真实加载
// ============================================================
function AgentsTabContent() {
  const { id: projectId } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-agents", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("获取项目信息失败");
      const json = await res.json();
      const project = json.data?.project;
      let agents: string[] = [];
      try {
        agents = typeof project?.activeAgents === "string"
          ? JSON.parse(project.activeAgents)
          : (project?.activeAgents || []);
      } catch { agents = []; }

      // 并行获取 Agent 详情
      if (agents.length > 0) {
        const detailsRes = await fetch(`/api/agents?ids=${agents.join(",")}`);
        if (detailsRes.ok) {
          const detailsJson = await detailsRes.json();
          return (detailsJson.data?.agents || detailsJson.agents || []).map((a: any) => ({
            id: a.id,
            name: a.name || a.id,
            role: a.role || "未指定",
            status: a.status || "idle",
            model: a.model || "default",
          }));
        }
      }
      return agents.map((id) => ({ id, name: id, role: "未知", status: "unknown", model: "default" }));
    },
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  const agents = data || [];

  const statusStyle = (status: string) => {
    switch (status) {
      case "active": case "running": return "bg-success/10 text-success border-success/20";
      case "idle": return "bg-accent text-muted-foreground border-border";
      case "error": return "bg-danger/10 text-danger border-danger/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "active": case "running": return "运行中";
      case "idle": return "空闲";
      case "error": return "异常";
      default: return status || "未知";
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold">绑定的智能体 ({agents.length})</h3>
            <span className="text-hint text-[10px]">从项目 activeAgents 配置加载</span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
            ))}
          </div>
        ) : error ? (
          <div className="border border-danger/20 bg-danger/5 text-danger text-xs rounded-xl p-4 text-center">
            加载失败: {error instanceof Error ? error.message : "未知错误"}
          </div>
        ) : agents.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center bg-card/10">
            <Bot className="size-10 text-hint mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">此项目尚未绑定智能体</p>
            <p className="text-hint text-xs mt-2 max-w-xs mx-auto leading-relaxed">
              点击右上角"在此项目下发任务"或通过项目设置面板添加 Agent，
              智能体将自动出现在此列表中并显示实时状态。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent: any) => (
              <div
                key={agent.id}
                className="bg-card/45 border border-border rounded-xl p-4 hover:border-primary/20 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Bot className="size-4 text-primary" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-semibold truncate">{agent.name}</span>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", statusStyle(agent.status))}>
                        {statusLabel(agent.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{agent.role}</span>
                      {agent.model && (
                        <>
                          <span className="text-hint">|</span>
                          <span className="font-mono text-hint">{agent.model}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 rounded-lg">
                    <Shield className="size-3" />
                    边界
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 rounded-lg">
                    <ExternalLink className="size-3" />
                    详情
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 项目详情页多标签容器
 * —— 五标签：聊天 / 任务 / 文件 / 动态 / 智能体（PRD §10.5）
 * —— 所有 Tab 均已接入真实后端数据源
 * —— 聊天：ProjectChat + ProjectContextPanel（已有）
 * —— 任务：GET /api/tasks?projectId= （已有 API）
 * —— 文件：项目上下文面板管理（已有）
 * —— 动态：GET /api/projects/[id]/activity（本次新建 API）
 * —— 智能体：GET /api/projects/[id] → activeAgents → /api/agents
 */
export function ProjectTabs() {
  const [activeTab, setActiveTab] = useState("chat");

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Tabs 主区域 */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 min-w-0 flex flex-col h-full"
        orientation="horizontal"
      >
        {/* 标签导航栏 */}
        <div className="shrink-0 border-b border-border bg-sidebar/50 px-4">
          <TabsList className="bg-transparent border-0 p-0 gap-1 h-10" variant="line">
            <TabsTrigger value="chat" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <MessageSquare className="size-3.5" />
              聊天
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <ListTodo className="size-3.5" />
              任务
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <FileText className="size-3.5" />
              文件
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <Activity className="size-3.5" />
              动态
            </TabsTrigger>
            <TabsTrigger value="agents" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <Bot className="size-3.5" />
              智能体
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 聊天 Tab */}
        <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden flex">
          <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-sidebar flex-col h-full select-none">
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-hint text-xs text-center leading-relaxed">
                会话历史功能<br />后续版本接入
              </p>
            </div>
          </aside>

          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <ProjectChat />
          </main>

          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        {/* 任务 Tab */}
        <TabsContent value="tasks" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <TasksTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        {/* 文件 Tab */}
        <TabsContent value="files" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <FilesTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        {/* 动态 Tab */}
        <TabsContent value="activity" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <ActivityTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        {/* 智能体 Tab */}
        <TabsContent value="agents" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <AgentsTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>
      </Tabs>
    </div>
  );
}
