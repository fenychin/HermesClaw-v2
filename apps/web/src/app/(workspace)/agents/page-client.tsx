"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AgentCard } from "./_components/agent-card";
import { NewAgentDialog } from "./_components/new-agent-dialog";
import { cn } from "@/lib/utils";

export interface AgentData {
  id: string;
  name: string;
  role: string;
  status: "active" | "idle" | "error";
  tags: string[];
  taskCount: number;
  isBuiltIn: boolean;
  automationLevel?: string;
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
function toAgentData(api: any): AgentData {
  return {
    id: api.id,
    name: api.name,
    role: api.role || "智能助手",
    // 映射状态为 UI 标准值
    status:
      api.status === "running" || api.status === "active"
        ? "active"
        : api.status === "error"
          ? "error"
          : "idle",
    tags: api.tags || [],
    taskCount: api.taskCount || 0,
    isBuiltIn: api.source === "builtin",
    automationLevel: api.automationLevel ?? "L2",
  };
}

export default function AgentsPage() {
  // 当前展开的智能体 ID
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // PERF: 稳定化 toggle handler，防止 AgentCard memo 因每次渲染产生新函数引用而失效
  const handleToggleExpand = useCallback((agentId: string) => {
    setExpandedAgentId((prev) => (prev === agentId ? null : agentId));
  }, []);

  const {
    data: agents,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["agents"],
    queryFn: async (): Promise<AgentData[]> => {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("获取智能体列表失败");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "未知错误");
      const list = (json.data?.agents || []) as any[];
      return list.map(toAgentData);
    },
    staleTime: 60_000,
    retry: 3,
  });

  const displayAgents: AgentData[] = agents ?? [];

  const builtInAgents = displayAgents.filter((a) => a.isBuiltIn);
  const customAgents = displayAgents.filter((a) => !a.isBuiltIn);

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-6">
      <PageHeader
        title="智能体"
        description="管理外贸 AI 数字员工——内置 8 个外贸岗位智能体，支持自定义创建与 Harness 等级配置"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isRefetching}
              className="bg-card border-border h-9 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", isRefetching && "animate-spin")} />
              刷新列表
            </Button>
            <NewAgentDialog />
          </div>
        }
      />

      {/* API 异常提示条 */}
      {isError && (
        <div className="flex items-center gap-2 mt-2 mb-1 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>无法连接后端智能体服务，请检查网络或刷新重试。</span>
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
          ) : displayAgents.length > 0 ? (
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
                  isExpanded={expandedAgentId === agent.id}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground text-xs">
              暂无任何智能体记录
            </div>
          )}
        </TabsContent>

        {/* 外贸专属 */}
        <TabsContent value="foreign-trade" className="mt-0">
          {isLoading ? (
            <AgentGridSkeleton />
          ) : builtInAgents.length > 0 ? (
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
                  isExpanded={expandedAgentId === agent.id}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground text-xs">
              暂无官方智能体记录
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
                  isExpanded={expandedAgentId === agent.id}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground text-xs">
              暂无自定义智能体，点击右上角新建。
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
