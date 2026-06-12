"use client";

import { useState } from "react";
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

/** 任务 Tab 的占位列表 */
function TasksTabContent() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">项目任务</h3>
          <span className="text-hint text-xs">后续版本接入真实 API</span>
        </div>
        <div className="border border-border rounded-xl p-8 text-center">
          <ListTodo className="size-8 text-hint mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">任务列表将通过 /api/projects/[id]/tasks 加载</p>
          <p className="text-hint text-xs mt-1">端点已就绪，前端数据对接后续迭代补齐</p>
        </div>
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
