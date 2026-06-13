"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Puzzle,
  Circle,
  ChevronRight,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { StatusBadge } from "@/components/common/status-badge";
import { AutomationLevelBadge } from "@/components/common/agent-status-badge";
import { useAgentStore } from "@/stores/agent-store";
import { useSkillStore } from "@/stores/skill-store";
import { apiClient } from "@/lib/api-client";
import type { Skill, SkillSource } from "@/types";
import { cn } from "@/lib/utils";

/** 技能分类定义 */
interface SkillCategory {
  key: string;
  label: string;
  sourceFilter: SkillSource[];
}

const CATEGORIES: SkillCategory[] = [
  { key: "trade", label: "外贸技能", sourceFilter: ["builtin"] },
  { key: "general", label: "通用技能", sourceFilter: ["industry-template"] },
  { key: "custom", label: "自定义技能", sourceFilter: ["custom"] },
];

/** 来源中文 */
const SOURCE_LABEL: Record<SkillSource, string> = {
  builtin: "内置",
  custom: "自定义",
  "industry-template": "行业模板",
};

/** 单条技能项（左侧列表） */
function SkillListItem({
  skill,
  isActive,
  onClick,
}: {
  skill: Skill;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        isActive
          ? "bg-brand/10 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Puzzle className={cn("size-4 shrink-0", isActive && "text-brand")} />
      <span className="min-w-0 flex-1 truncate">{skill.name}</span>
      <Circle
        className={cn(
          "size-2 shrink-0 fill-current",
          skill.status === "active" ? "text-success" : "text-hint"
        )}
      />
    </button>
  );
}

/** 技能详情面板（右侧） */
function SkillDetail({ skill }: { skill: Skill }) {
  const storeAgents = useAgentStore((s) => s.agents);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const usedAgents = useMemo(() => {
    return storeAgents.filter((a) => skill.usedByAgents.includes(a.id));
  }, [skill, storeAgents]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // 首次尝试（不带 confirm）
      const result = await apiClient.testSkill(skill.id);
      const data = result as { success?: boolean; message?: string; error?: string };
      setTestResult({
        ok: data.success !== false,
        message: data.message ?? "技能测试已执行",
      });
    } catch (err: unknown) {
      // L3 技能需二次确认：API 返回 409
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 409 && skill.automationLevel === "L3") {
        const confirmed = confirm(
          `「${skill.name}」为 L3 需人工确认技能，测试后将立即生效且无法撤销。确认执行测试？`,
        );
        if (confirmed) {
          try {
            const retryResult = await apiClient.testSkill(skill.id, true);
            const retryData = retryResult as { success?: boolean; message?: string };
            setTestResult({
              ok: retryData.success !== false,
              message: retryData.message ?? "技能测试已执行（已确认）",
            });
          } catch (retryErr: unknown) {
            const retryApiErr = retryErr as { message?: string };
            setTestResult({
              ok: false,
              message: retryApiErr.message ?? "确认后测试请求失败",
            });
          }
        } else {
          setTestResult({
            ok: false,
            message: "已取消：L3 技能测试需人工确认",
          });
        }
      } else {
        setTestResult({
          ok: false,
          message: apiErr.message ?? "测试请求失败",
        });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-foreground text-lg font-semibold">
              {skill.name}
            </h2>
            <AutomationLevelBadge level={skill.automationLevel} />
            <span className="bg-accent text-muted-foreground rounded-md px-2 py-0.5 text-[10px] font-mono">
              v{skill.version}
            </span>
            <span className="bg-accent text-muted-foreground rounded-md px-2 py-0.5 text-[10px]">
              {SOURCE_LABEL[skill.source]}
            </span>
            <StatusBadge
              status={skill.status === "active" ? "running" : skill.status === "inactive" ? "idle" : "paused"}
            />
          </div>
        </div>

        {/* 启用/停用开关 */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {skill.status === "active" ? "已启用" : "已停用"}
          </span>
          <button
            type="button"
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              skill.status === "active" ? "bg-brand" : "bg-muted"
            )}
            role="switch"
            aria-checked={skill.status === "active"}
          >
            <span
              className={cn(
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow transition-transform",
                skill.status === "active" ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* 描述 */}
      <p className="text-muted-foreground text-sm leading-relaxed">
        {skill.description}
      </p>

      {/* 统计指标 */}
      {skill.stats && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-accent/30 border border-border/50 rounded-xl p-3 flex flex-col">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wide">最近执行统计</span>
            <span className="text-foreground text-lg font-bold mt-1">
              {skill.stats.callCount} 次调用
            </span>
          </div>
          <div className="bg-accent/30 border border-border/50 rounded-xl p-3 flex flex-col">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wide">执行成功率</span>
            <span className={cn(
              "text-lg font-bold mt-1",
              skill.stats.successRate >= 0.9 ? "text-success" : "text-warning"
            )}>
              {(skill.stats.successRate * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* 输入规格 */}
      <div>
        <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
          输入规格
        </h3>
        <pre className="bg-black/30 text-muted-foreground overflow-x-auto rounded-lg border border-white/5 p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(JSON.parse(skill.inputSchema), null, 2)}
        </pre>
      </div>

      {/* 输出规格 */}
      <div>
        <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
          输出规格
        </h3>
        <pre className="bg-black/30 text-muted-foreground overflow-x-auto rounded-lg border border-white/5 p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(JSON.parse(skill.outputSchema), null, 2)}
        </pre>
      </div>

      {/* 适用场景 */}
      <div>
        <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
          适用场景
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {skill.scenarios.map((s) => (
            <span
              key={s}
              className="bg-accent text-muted-foreground rounded-md px-2.5 py-1 text-xs"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* 使用该技能的智能体 */}
      {usedAgents.length > 0 && (
        <div>
          <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
            使用该技能的智能体
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {usedAgents.map((agent) => (
              <span
                key={agent.id}
                className="bg-brand/10 text-brand rounded-md px-2.5 py-1 text-xs font-medium"
              >
                {agent.name} · {agent.role}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 测试技能按钮 */}
      <div className="border-border border-t pt-4 space-y-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {testing ? "测试中…" : "测试技能"}
        </button>

        {testResult && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
              testResult.ok
                ? "border-success/30 bg-success/5 text-success"
                : "border-danger/30 bg-danger/5 text-danger",
            )}
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 智慧大脑 → 技能库页 */
export default function SkillsPage() {
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  // 用户未手动选择时为 null，渲染时回退到首个技能（避免 setState-in-effect）
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
    loadAgents();
  }, [loadSkills, loadAgents]);

  // 有效选中 id：优先用户选择，否则默认首个技能
  const effectiveId = selectedId ?? skills[0]?.id ?? "";

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === effectiveId) ?? null,
    [skills, effectiveId]
  );

  return (
    <PageTransition>
    <div className="space-y-6">
      <PageHeader
        title="技能库"
        description="行业 / 岗位 / 自定义技能，版本化、可测试、可绑定至智能体"
      />

      {/* 双栏布局 */}
      <div className="flex gap-6">
        {/* 左侧：分类树 + 技能列表 */}
        <div className="w-64 shrink-0 space-y-4">
          {CATEGORIES.map((cat) => {
            const catSkills = skills.filter((s) =>
              cat.sourceFilter.includes(s.source)
            );
            if (catSkills.length === 0) return null;

            return (
              <div key={cat.key}>
                <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide">
                  <ChevronRight className="size-3" />
                  {cat.label}
                  <span className="text-hint ml-auto text-[10px]">
                    {catSkills.length}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {catSkills.map((skill) => (
                    <SkillListItem
                      key={skill.id}
                      skill={skill}
                      isActive={effectiveId === skill.id}
                      onClick={() => setSelectedId(skill.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 右侧：技能详情 */}
        <div className="bg-card border-border min-h-[400px] flex-1 rounded-2xl border p-6">
          {selectedSkill ? (
            <SkillDetail skill={selectedSkill} />
          ) : (
            <EmptyState
              icon={Puzzle}
              title="暂无选中技能"
              description="请从左侧列表选择一个技能以查看详细规格及测试"
            />
          )}
        </div>
      </div>
    </div>
  </PageTransition>
  );
}
