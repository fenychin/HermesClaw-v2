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
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectChat } from "./project-chat";
import { ProjectContextPanel } from "./project-context-panel";

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

/** 任务 Tab 真实接线面板 */
function TasksTabContent() {
  const { id: projectId } = useParams();

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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">项目任务 ({tasks.length})</h3>
          <span className="text-hint text-xs">从项目空间关联的任务库中实时读取</span>
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
        ) : tasks.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center bg-card/10">
            <ListTodo className="size-8 text-hint mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">该项目空间暂无任务记录</p>
            <p className="text-hint text-xs mt-1">关联智能体在分析询盘与跟进流程中将自动在此派发任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task: any) => (
              <div
                key={task.id}
                className="bg-card/45 border border-border rounded-xl p-4 hover:border-primary/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-semibold">{task.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${PRIORITY_COLORS[task.priority] || "bg-accent text-muted-foreground"}`}>
                      {task.priority || "MEDIUM"}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-muted-foreground text-xs leading-relaxed max-w-xl">
                      {task.description}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="text-hint font-mono">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
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

/** 文件 Tab 的占位列表 */
function FilesTabContent() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">项目文件</h3>
          <span className="text-hint text-xs">后续版本接入</span>
        </div>
        <div className="border border-border rounded-xl p-8 text-center">
          <FileText className="size-8 text-hint mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">项目文件将在右侧面板中管理</p>
          <p className="text-hint text-xs mt-1">支持上传、预览与 AI 上下文引用</p>
        </div>
      </div>
    </div>
  );
}

/** 动态 Tab 的占位列表 */
function ActivityTabContent() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">项目动态</h3>
          <span className="text-hint text-xs">后续版本接入 AgentLog</span>
        </div>
        <div className="border border-border rounded-xl p-8 text-center">
          <Activity className="size-8 text-hint mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">活动流将展示智能体执行日志与项目事件</p>
          <p className="text-hint text-xs mt-1">数据来源：AgentLog + AuditLog 按项目ID过滤</p>
        </div>
      </div>
    </div>
  );
}

/** 智能体 Tab 的占位列表 */
function AgentsTabContent() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">绑定的智能体</h3>
          <span className="text-hint text-xs">后续版本接入真实数据</span>
        </div>
        <div className="border border-border rounded-xl p-8 text-center">
          <Bot className="size-8 text-hint mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">智能体列表将从项目 activeAgents 配置加载</p>
          <p className="text-hint text-xs mt-1">支持查看状态、指派任务与边界调整</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 项目详情页多标签容器
 * —— 五标签：聊天 / 任务 / 文件 / 动态 / 智能体（PRD §10.5）
 * —— 聊天 Tab 复用 ProjectChat + ProjectContextPanel
 * —— 其余 Tab 当前为占位，后续迭代补齐数据对接
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

        {/* 聊天 Tab：与现有三栏布局保持一致 */}
        <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden flex">
          {/* 左栏：会话历史占位 */}
          <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-sidebar flex-col h-full select-none">
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-hint text-xs text-center leading-relaxed">
                会话历史功能<br />后续版本接入
              </p>
            </div>
          </aside>

          {/* 中栏：聊天主区 */}
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <ProjectChat />
          </main>

          {/* 右栏：项目配置面板 */}
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        {/* 其余 Tab 内容区 */}
        <TabsContent value="tasks" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <TasksTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        <TabsContent value="files" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <FilesTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        <TabsContent value="activity" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <ActivityTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

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
