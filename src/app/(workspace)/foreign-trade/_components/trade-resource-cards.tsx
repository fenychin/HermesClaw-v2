"use client";

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
      href={`/agents/${agent.id}`}
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

/** 智能体列表区块 */
export function AgentSection({
  agents,
  isLoading,
}: {
  agents: AgentItem[]
  isLoading: boolean
}) {
  const display = agents.slice(0, 3)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="text-foreground font-medium text-sm">外贸专属智能体</p>
        <Link
          href="/agents"
          className="text-primary text-xs hover:text-primary/80 transition-colors flex items-center gap-0.5"
        >
          全部 <ArrowRight className="size-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-accent/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-hint text-xs text-center">
            暂无外贸专属智能体，请在智能体管理页面创建
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {display.map((agent) => (
            <AgentRecommendCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  )
}

// ============================================================
// 知识模板卡片
// ============================================================

export function SkillTemplateCard({ skill }: { skill: SkillItem }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3.5 group hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className="bg-brand-blue/10 rounded-lg p-1.5 shrink-0">
          <Zap className="size-4 text-brand-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium truncate">{skill.name}</p>
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
    </div>
  )
}

/** 知识模板列表区块 */
export function SkillSection({
  skills,
  isLoading,
}: {
  skills: SkillItem[]
  isLoading: boolean
}) {
  const display = skills.slice(0, 4)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="text-foreground font-medium text-sm">外贸知识模板</p>
        <Link
          href="/brain/skills"
          className="text-primary text-xs hover:text-primary/80 transition-colors flex items-center gap-0.5"
        >
          全部 <ArrowRight className="size-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-accent/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-hint text-xs text-center">
            暂无外贸知识模板
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {display.map((skill) => (
            <SkillTemplateCard key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </section>
  )
}

// ============================================================
// 连接器推荐卡片
// ============================================================

export function ConnectorRecommendCard({ connector }: { connector: ConnectorItem }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3.5 group hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className="bg-warning/10 rounded-lg p-1.5 shrink-0">
          <Plug className="size-4 text-warning" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium truncate">{connector.name}</p>
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
    </div>
  )
}

/** 连接器推荐列表区块 */
export function ConnectorSection({
  connectors,
  isLoading,
}: {
  connectors: ConnectorItem[]
  isLoading: boolean
}) {
  const display = connectors.slice(0, 3)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="text-foreground font-medium text-sm">连接器推荐</p>
        <Link
          href="/brain/connectors"
          className="text-primary text-xs hover:text-primary/80 transition-colors flex items-center gap-0.5"
        >
          全部 <ArrowRight className="size-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 bg-accent/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-hint text-xs text-center">
            暂无推荐连接器
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {display.map((connector) => (
            <ConnectorRecommendCard key={connector.id} connector={connector} />
          ))}
        </div>
      )}
    </section>
  )
}
