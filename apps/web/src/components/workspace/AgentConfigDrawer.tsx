"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAgentConfigStore } from "@/stores/agent-config-store";
import { updateSkillBindings } from "@/lib/api/workspace";
import { Bot, X, ShieldAlert, Check, Loader2, Play, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// 只读的自动化等级展示，不涉及后端 store 的完整策略对象
const AUTOMATION_LEVEL_LABELS: Record<string, string> = {
  "default": "L2 - 半自动（AI 建议，人工触发）",
  "foreign-trade-inquiry": "L3 - 自动（业务自动执行，高危操作二次审批）",
  "foreign-trade-follow": "L3 - 自动（跟进自适应决策，高危审批防线）",
};

interface AgentConfigDrawerProps {
  onClose: () => void;
}

export function AgentConfigDrawer({ onClose }: AgentConfigDrawerProps) {
  const availableAgents = useAgentConfigStore((s) => s.availableAgents);
  const selectedAgentId = useAgentConfigStore((s) => s.selectedAgentId);
  const selectAgent = useAgentConfigStore((s) => s.actions.selectAgent);
  const loadAgents = useAgentConfigStore((s) => s.actions.loadAgents);

  useEffect(() => {
    loadAgents().catch(() => {});
  }, [loadAgents]);

  const currentAgent = availableAgents.find((a) => a.id === selectedAgentId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 抽屉面板 */}
      <div className="w-[400px] h-full bg-card/95 border-l border-border relative z-10 flex flex-col backdrop-blur-md shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* 头部 */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-border shrink-0">
          <span className="text-foreground font-semibold text-xs uppercase tracking-wider flex items-center gap-2">
            <Bot className="size-4 text-[#6D5EF9]" />
            Agent 库 (配置面板)
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 智能体选择与配置内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <span className="text-[10px] text-muted-foreground font-semibold px-1 uppercase tracking-wider block mb-3">
              选择需要配置的智能体模板
            </span>
            <AgentTemplateSelector
              agents={availableAgents}
              selectedId={selectedAgentId}
              onSelect={(agentId) => {
                selectAgent(agentId);
                // ✅ 只更新 selectedAgentId，不创建/篡改 Session
              }}
            />
          </div>

          {/* Policy 只读摘要 */}
          {selectedAgentId && currentAgent && (
            <PolicySummaryCard
              agentName={currentAgent.name}
              skillCount={currentAgent.tags.length}
              automationLevelLabel={AUTOMATION_LEVEL_LABELS[selectedAgentId] || AUTOMATION_LEVEL_LABELS["default"]}
            />
          )}

          {/* 技能绑定编辑 */}
          {selectedAgentId && currentAgent && (
            <SkillBindingEditor
              agentId={selectedAgentId}
              currentSkills={currentAgent.tags}
              onSubmit={async (patches) => {
                try {
                  const { proposalId } = await updateSkillBindings(selectedAgentId, patches);
                  // ✅ 严格显示「变更已提交审批」，不得提示「保存成功」，因为变更需要走 Proposal 审核
                  toast.info(`技能变更已提交审批，提案 ID: ${proposalId}`);
                } catch (err) {
                  console.error("Failed to submit skill proposal:", err);
                  toast.error("提交技能变更提案失败");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface SelectorProps {
  agents: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 智能体模板选择器 */
function AgentTemplateSelector({ agents, selectedId, onSelect }: SelectorProps) {
  return (
    <div className="space-y-2">
      {agents.map((agent) => {
        const isSelected = selectedId === agent.id;
        return (
          <div
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            className={cn(
              "border rounded-xl p-3 cursor-pointer transition-all duration-200 flex justify-between items-center",
              isSelected
                ? "border-[#6D5EF9]/40 bg-[#6D5EF9]/5 shadow-sm"
                : "border-border hover:border-border/80 bg-background/40 hover:bg-background/60"
            )}
          >
            <div className="min-w-0 flex-1">
              <h4 className="text-foreground font-semibold text-xs flex items-center gap-1.5">
                {agent.name}
                <span className="text-[9px] text-muted-foreground font-medium">({agent.role})</span>
              </h4>
              <p className="text-muted-foreground text-[10px] truncate mt-1">{agent.description}</p>
            </div>
            <div className="shrink-0 pl-2">
              <div
                className={cn(
                  "size-4 rounded-full border flex items-center justify-center transition-all",
                  isSelected
                    ? "border-[#6D5EF9] bg-[#6D5EF9] text-white"
                    : "border-border bg-background"
                )}
              >
                {isSelected && <Check className="size-2.5" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface PolicyCardProps {
  agentName: string;
  automationLevelLabel: string;
  skillCount: number;
}

/** 只读策略摘要卡片 */
function PolicySummaryCard({ agentName, automationLevelLabel, skillCount }: PolicyCardProps) {
  return (
    <div className="bg-background/50 border border-border rounded-xl p-4 space-y-3 relative overflow-hidden">
      <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-[#6D5EF9]/5 rounded-full blur-lg" />
      <h3 className="text-foreground font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5 border-b border-border/40 pb-2">
        <ShieldAlert className="size-4 text-[#6D5EF9]" />
        策略摘要 (Policy Summary)
      </h3>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-[11px]">智能体名称:</span>
          <span className="text-foreground font-medium">{agentName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-[11px]">自动化等级:</span>
          <span className="text-amber-500 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px]">
            {automationLevelLabel}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-[11px]">已绑定技能数:</span>
          <span className="text-foreground font-mono font-semibold">{skillCount} 个</span>
        </div>
      </div>
      <p className="text-muted-foreground text-[9px] leading-relaxed pt-1.5 border-t border-border/30">
        ℹ️ 本页面仅提供策略的只读摘要，核心权限由后端管控，前端无法直接修改策略级别。
      </p>
    </div>
  );
}

interface EditorProps {
  agentId: string;
  currentSkills: string[];
  onSubmit: (patches: { skillId: string; enabled: boolean }[]) => Promise<void>;
}

/** 技能绑定编辑器 (走提案审批流) */
function SkillBindingEditor({ agentId, currentSkills, onSubmit }: EditorProps) {
  const [submitting, setSubmitting] = useState(false);

  // 从 `/api/skills` 拉取全量技能库，用以提供绑定/解绑的选择
  const { data: allSkills, isLoading } = useQuery({
    queryKey: ["all-skills-list"],
    queryFn: async (): Promise<any[]> => {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error("获取技能库失败");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "获取失败");
      return json.data?.skills || [];
    },
    staleTime: 60_000,
  });

  const [selectedSkills, setSelectedSkills] = useState<string[]>(currentSkills);

  // 当外部传入的当前绑定技能变化时，同步本地状态
  useEffect(() => {
    setSelectedSkills(currentSkills);
  }, [currentSkills]);

  const toggleSkill = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    );
  };

  async function handleApply() {
    setSubmitting(true);
    // 比对当前选择与最初绑定的状态，构建 patch
    const patches: { skillId: string; enabled: boolean }[] = [];
    
    const allAvailable = allSkills || [];
    allAvailable.forEach((skill) => {
      const wasBound = currentSkills.includes(skill.id);
      const isBound = selectedSkills.includes(skill.id);
      if (wasBound !== isBound) {
        patches.push({ skillId: skill.id, enabled: isBound });
      }
    });

    if (patches.length === 0) {
      toast.info("未检测到技能绑定变化");
      setSubmitting(false);
      return;
    }

    try {
      await onSubmit(patches);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-4 animate-spin text-[#6D5EF9]" />
        <span className="text-muted-foreground text-xs ml-2">正在载入可用技能库...</span>
      </div>
    );
  }

  const list = allSkills || [];

  return (
    <div className="space-y-4">
      <div className="border-b border-border/40 pb-2">
        <span className="text-[10px] text-muted-foreground font-semibold px-1 uppercase tracking-wider block">
          可用技能配置
        </span>
      </div>

      <div className="space-y-2">
        {list.map((skill: any) => {
          const isChecked = selectedSkills.includes(skill.id);
          return (
            <div
              key={skill.id}
              onClick={() => toggleSkill(skill.id)}
              className={cn(
                "border rounded-xl p-3 cursor-pointer flex justify-between items-center transition-all",
                isChecked ? "border-[#6D5EF9]/20 bg-[#6D5EF9]/5" : "border-border bg-background/20"
              )}
            >
              <div className="min-w-0 flex-1">
                <h5 className="text-foreground font-semibold text-xs">{skill.name}</h5>
                <p className="text-muted-foreground text-[10px] mt-0.5 leading-relaxed">{skill.description}</p>
              </div>
              <div className="shrink-0 pl-2">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}} // 由外部 div 的 onClick 统一处理
                  className="rounded border-border text-[#6D5EF9] focus:ring-[#6D5EF9] cursor-pointer size-4"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <Button
          onClick={handleApply}
          disabled={submitting}
          className="w-full bg-[#6D5EF9] hover:bg-[#5B4EE0] text-white h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm shadow-[#6D5EF9]/10"
        >
          {submitting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          <span>提交技能变更提案</span>
        </Button>
      </div>
    </div>
  );
}
