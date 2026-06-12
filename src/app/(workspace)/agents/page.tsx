"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentCard } from "./_components/agent-card";
import { mockAgents, type AgentData } from "./_data/mock-agents";
import { NewAgentDialog } from "./_components/new-agent-dialog";
import { useOpenClawStream } from "@/hooks/use-openclaw-stream";

/** API 返回的智能体原始数据 */
interface AgentApiItem {
  id: string
  name: string
  role: string
  status: string
  source: string
  category: string[]
  automationLevel?: string
  statsJson?: Record<string, unknown>
}

/** 骨架屏 —— 8 张卡片占位 */
function AgentGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="bg-card rounded-2xl border border-border p-5 h-[220px] animate-pulse"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-accent" />
              <div className="flex flex-col gap-2">
                <div className="w-24 h-4 rounded bg-accent" />
                <div className="w-16 h-3 rounded bg-accent" />
              </div>
            </div>
            <div className="w-14 h-5 rounded-full bg-accent" />
          </div>
          <div className="flex gap-2 mt-4">
            <div className="w-16 h-5 rounded-lg bg-accent" />
            <div className="w-12 h-5 rounded-lg bg-accent" />
            <div className="w-14 h-5 rounded-lg bg-accent" />
          </div>
          <div className="flex items-end justify-between mt-auto pt-8">
            <div className="w-24 h-3 rounded bg-accent" />
            <div className="flex gap-2">
              <div className="w-14 h-8 rounded bg-accent" />
              <div className="w-14 h-8 rounded bg-accent" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 将 API 数据映射为 AgentCard 所需格式 */
function toAgentData(api: AgentApiItem): AgentData {
  return {
    id: api.id,
    name: api.name,
    role: api.role,
    // API status: running/idle/error/paused → AgentCard: active/idle/error
    status:
      api.status === "running" || api.status === "paused"
        ? "active"
        : api.status === "error"
          ? "error"
          : "idle",
    tags: api.category ?? [],
    taskCount: (api.statsJson?.todayTasks as number) ?? 0,
    isBuiltIn: api.source === "builtin",
    automationLevel: api.automationLevel ?? "L2",
  };
}

export default function AgentsPage() {
  // 订阅全局 SSE 实时事件流（AGENTS.md §4.8）
  // 自动更新 Zustand agentExecutionStates → AgentCard 实时状态圆点
  useOpenClawStream();

  const {
    data: agents,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["agents"],
    queryFn: async (): Promise<AgentData[]> => {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("获取智能体列表失败");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "未知错误");
      const list = json.data.agents as AgentApiItem[];
      return list.map(toAgentData);
    },
    staleTime: 30_000,
    retry: 1,
  });

  // API 失败或返回空数组时，自动回退到页面级 mock 数据
  const displayAgents: AgentData[] =
    isError || (!isLoading && !agents?.length) ? mockAgents : (agents ?? []);

  const builtInAgents = displayAgents.filter((a) => a.isBuiltIn);
  const customAgents = displayAgents.filter((a) => !a.isBuiltIn);

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-6">
      <PageHeader
        title="智能体"
        description="管理外贸 AI 数字员工——内置 8 个外贸岗位智能体，支持自定义创建与 Harness 等级配置"
        actions={<NewAgentDialog />}
      />

      {/* API 异常提示条 */}
      {isError && (
        <div className="flex items-center gap-2 mt-2 mb-1 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>API 暂不可用，当前展示本地回退数据</span>
        </div>
      )}

      <Tabs defaultValue="all" className="w-full mt-4">
        <TabsList className="mb-6">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="foreign-trade">外贸专属</TabsTrigger>
          <TabsTrigger value="custom">自定义</TabsTrigger>
        </TabsList>

        {/* 全部 */}
        <TabsContent value="all" className="mt-0">
          {isLoading ? (
            <AgentGridSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  id={agent.id}
                  name={agent.name}
                  role={agent.role}
                  status={agent.status}
                  tags={agent.tags}
                  taskCount={agent.taskCount}
                  isBuiltIn={agent.isBuiltIn}
                  automationLevel={agent.automationLevel ?? "L2"}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* 外贸专属 */}
        <TabsContent value="foreign-trade" className="mt-0">
          {isLoading ? (
            <AgentGridSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {builtInAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  id={agent.id}
                  name={agent.name}
                  role={agent.role}
                  status={agent.status}
                  tags={agent.tags}
                  taskCount={agent.taskCount}
                  isBuiltIn={agent.isBuiltIn}
                  automationLevel={agent.automationLevel ?? "L2"}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* 自定义 */}
        <TabsContent value="custom" className="mt-0">
          {isLoading ? (
            <AgentGridSkeleton />
          ) : customAgents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {customAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  id={agent.id}
                  name={agent.name}
                  role={agent.role}
                  status={agent.status}
                  tags={agent.tags}
                  taskCount={agent.taskCount}
                  isBuiltIn={agent.isBuiltIn}
                  automationLevel={agent.automationLevel ?? "L2"}
                />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center flex flex-col items-center justify-center border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground text-sm mb-4">
                暂无自定义智能体
              </p>
              <NewAgentDialog />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
