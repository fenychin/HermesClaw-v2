"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  Zap,
  Plug,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentItem, SkillItem, ConnectorItem } from "@/hooks/use-foreign-trade-resources";

// ============================================================
// 智能体推荐卡片
// ============================================================

export function AgentRecommendCard({ agent }: { agent: AgentItem }) {
  const tasks = agent.statsJson?.totalTasksCount ?? null

  return (
    <Link
      href={`/workspace/agents/${agent.id}`}
      className={cn(
        "bg-card rounded-xl border border-border p-3.5",
        "hover:border-primary/40 hover:shadow-sm",
        "cursor-pointer transition-all duration-200 block",
        "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="bg-primary/10 rounded-lg p-1.5 shrink-0">
          <Bot className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm font-medium truncate">{agent.name}</p>
            <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{agent.description}</p>
          {tasks !== null && (
            <span className="inline-block text-hint text-[10px] mt-1.5 bg-accent/40 rounded px-1.5 py-0.5">
              {typeof tasks === "number" ? `${tasks} 次执行` : ""}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}



// ============================================================
// 知识模板卡片
// ============================================================

export function SkillTemplateCard({ skill }: { skill: SkillItem }) {
  return (
    <Link
      href="/brain/skills"
      className={cn(
        "bg-card rounded-xl border border-border p-3.5 block",
        "hover:border-primary/40 hover:shadow-sm",
        "cursor-pointer transition-all duration-200",
        "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="bg-brand-blue/10 rounded-lg p-1.5 shrink-0">
          <Zap className="size-4 text-brand-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm font-medium truncate">{skill.name}</p>
            <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{skill.description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                skill.status === "active"
                  ? "bg-success/10 text-success"
                  : "bg-border/40 text-muted-foreground",
              )}
            >
              {skill.status === "active" ? "已激活" : skill.status}
            </span>
            <span className="text-hint text-[10px]">v{skill.version}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}



// ============================================================
// 连接器推荐卡片
// ============================================================

export function ConnectorRecommendCard({ connector }: { connector: ConnectorItem }) {
  return (
    <Link
      href="/brain/connectors"
      className={cn(
        "bg-card rounded-xl border border-border p-3.5 block",
        "hover:border-primary/40 hover:shadow-sm",
        "cursor-pointer transition-all duration-200",
        "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="bg-warning/10 rounded-lg p-1.5 shrink-0">
          <Plug className="size-4 text-warning" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-foreground text-sm font-medium truncate">{connector.name}</p>
            <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{connector.description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-hint text-[10px] capitalize">{connector.category}</span>
            <span className="text-hint text-[10px]">{connector.provider}</span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto",
                connector.status === "connected"
                  ? "bg-success/10 text-success"
                  : "bg-border/40 text-muted-foreground",
              )}
            >
              {connector.status === "connected" ? "已连接" : connector.status}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

interface RecommendedResourcesProps {
  agents: AgentItem[]
  skills: SkillItem[]
  connectors: ConnectorItem[]
  isLoading: boolean
}

export function RecommendedResourcesCard({
  agents,
  skills,
  connectors,
  isLoading,
}: RecommendedResourcesProps) {
  const [activeTab, setActiveTab] = useState<"agents" | "skills" | "connectors">(
    "agents"
  )

  const viewAllLinks = {
    agents: "/workspace/agents",
    skills: "/brain/skills",
    connectors: "/brain/connectors",
  }

  return (
    <section className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-5 space-y-4">
      {/* 头部：标题与 Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary animate-pulse" />
          <h3 className="text-foreground text-sm font-semibold">外贸推荐资源</h3>
        </div>

        {/* Tab 切换栏 */}
        <div className="flex items-center gap-1 bg-background/50 border border-border/80 rounded-xl p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("agents")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              activeTab === "agents"
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bot className="size-3.5" />
            <span>智能体 ({agents.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("skills")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              activeTab === "skills"
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="size-3.5" />
            <span>知识模板 ({skills.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("connectors")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              activeTab === "connectors"
                ? "bg-primary/15 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Plug className="size-3.5" />
            <span>连接器 ({connectors.length})</span>
          </button>
        </div>
      </div>

      {/* 列表内容区 */}
      <div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-accent/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === "agents" && (
              <>
                {agents.length === 0 ? (
                  <div className="bg-background/20 rounded-xl border border-border border-dashed p-6 text-center text-hint text-xs">
                    暂无推荐智能体
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                    {agents.slice(0, 6).map((agent) => (
                      <AgentRecommendCard key={agent.id} agent={agent} />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "skills" && (
              <>
                {skills.length === 0 ? (
                  <div className="bg-background/20 rounded-xl border border-border border-dashed p-6 text-center text-hint text-xs">
                    暂无推荐知识模板
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                    {skills.slice(0, 6).map((skill) => (
                      <SkillTemplateCard key={skill.id} skill={skill} />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "connectors" && (
              <>
                {connectors.length === 0 ? (
                  <div className="bg-background/20 rounded-xl border border-border border-dashed p-6 text-center text-hint text-xs">
                    暂无推荐连接器
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
                    {connectors.slice(0, 6).map((conn) => (
                      <ConnectorRecommendCard key={conn.id} connector={conn} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 查看全部底部跳转 */}
            <div className="flex justify-end pt-2 mt-1">
              <Link
                href={viewAllLinks[activeTab]}
                className="text-primary text-xs hover:text-primary/80 transition-colors flex items-center gap-0.5 font-medium group"
              >
                <span>管理全部</span>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
