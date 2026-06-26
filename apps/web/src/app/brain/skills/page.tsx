"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Puzzle,
  Circle,
  Search,
  Plus,
  Folder,
  FileText,
  FileCode,
  File,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { SkillDetailPanel } from "@/components/brain/skills/SkillDetailPanel";
import { CreateSkillModal } from "@/components/brain/skills/CreateSkillModal";
import { useAgentStore } from "@/stores/agent-store";
import { useSkillStore } from "@/stores/skill-store";
import { apiClient } from "@/lib/api-client";
import type { Skill, SkillSource } from "@/types";
import { cn } from "@/lib/utils";

/** 物理文件树的单项组件 */
function FileTreeItem({
  item,
  isSelected,
  onClick,
}: {
  item: { path: string; type: "file" | "directory" };
  isSelected: boolean;
  onClick: () => void;
}) {
  const parts = item.path.split("/");
  const depth = parts.length - 1;
  const displayName = parts[parts.length - 1];

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 text-left text-xs transition-colors",
        isSelected
          ? "bg-brand/10 text-brand font-medium rounded"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground rounded"
      )}
    >
      {item.type === "directory" ? (
        <Folder className="size-3.5 text-hint shrink-0" />
      ) : displayName.endsWith(".md") ? (
        <FileText className="size-3.5 text-hint shrink-0 animate-fade-in" />
      ) : displayName.endsWith(".py") ? (
        <FileCode className="size-3.5 text-hint shrink-0 animate-fade-in" />
      ) : (
        <File className="size-3.5 text-hint shrink-0" />
      )}
      <span className="truncate">{displayName}</span>
    </button>
  );
}

/** 来源 Tab 配置 */
const SOURCE_TABS: { key: SkillSource | "ALL"; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "BUILTIN", label: "内置" },
  { key: "CUSTOM", label: "自定义" },
  { key: "EXTERNAL", label: "外部安装" },
];

/** 智慧大脑 → 技能库页（重构版：折叠式技能文件树结构） */
export default function SkillsPage() {
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const loadAgents = useAgentStore((s) => s.loadAgents);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SkillSource | "ALL">("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 技能的物理文件树缓存
  const [skillDetails, setSkillDetails] = useState<Record<string, Skill>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});

  // 折叠状态控制
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSkills();
    loadAgents();
  }, [loadSkills, loadAgents]);

  // 过滤后的技能列表
  const filteredSkills = useMemo(() => {
    let list = skills;
    if (sourceFilter !== "ALL") {
      list = list.filter((s) => s.source === sourceFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [skills, sourceFilter, search]);

  // 有效选中 id
  const effectiveId = selectedId ?? filteredSkills[0]?.id ?? "";

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === effectiveId) ?? null,
    [skills, effectiveId],
  );

  // 异步加载选中的技能物理目录 fileTree
  const loadSkillDetail = async (skillId: string) => {
    if (skillDetails[skillId]) return;
    setLoadingDetails((prev) => ({ ...prev, [skillId]: true }));
    try {
      const data = await apiClient.getSkill(skillId);
      if (data && (data as any).skill) {
        setSkillDetails((prev) => ({ ...prev, [skillId]: (data as any).skill }));
      }
    } catch (err) {
      console.error("加载技能文件树失败:", err);
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [skillId]: false }));
    }
  };

  useEffect(() => {
    if (effectiveId) {
      loadSkillDetail(effectiveId);
      setExpandedSkills((prev) => {
        if (prev[effectiveId] === undefined) {
          return { ...prev, [effectiveId]: true };
        }
        return prev;
      });
    }
  }, [effectiveId]);

  // 按 category 对技能分组
  const groupedSkills = useMemo(() => {
    const groups: Record<string, Skill[]> = {};
    for (const s of filteredSkills) {
      const cat = s.category || "常规技能";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [filteredSkills]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleSkillExpand = (skillId: string) => {
    setExpandedSkills((prev) => ({ ...prev, [skillId]: !prev[skillId] }));
    loadSkillDetail(skillId);
  };

  return (
    <PageTransition>
      <div className="w-full max-w-7xl mx-auto py-6 px-6 space-y-6">
        <PageHeader
          title="技能库"
          description="行业 / 岗位 / 自定义技能，版本化、可测试、可绑定至智能体"
          breadcrumb={[{ label: "智慧大脑", href: "/brain/memory" }, { label: "技能 Skill" }]}
        />
        <div className="flex items-center gap-4">
          {/* 搜索 */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索技能名称、描述、分类…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-accent/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand/50 transition-colors"
            />
          </div>

          {/* 来源 Tab */}
          <div className="flex gap-1 bg-accent/30 rounded-lg p-0.5">
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSourceFilter(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  sourceFilter === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 创建入口 */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="shrink-0 inline-flex items-center gap-1.5 bg-brand text-white rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            <Plus className="size-4" />
            创建技能
          </button>
        </div>

        {/* 双栏布局 */}
        <div className="flex gap-6 items-start">
          {/* 左侧：折叠式技能文件树 */}
          <div className="w-72 shrink-0 space-y-4 max-h-[75vh] overflow-y-auto pr-2 border-r border-border/40">
            <div className="text-muted-foreground px-1 text-[10px] font-bold uppercase tracking-wider border-b border-border/40 pb-1.5 flex items-center justify-between">
              <span>
                {sourceFilter === "ALL" ? "全部技能分类" : SOURCE_TABS.find((t) => t.key === sourceFilter)?.label}
              </span>
              <span className="text-hint font-mono text-[9px]">{filteredSkills.length}</span>
            </div>

            {filteredSkills.length === 0 ? (
              <div className="text-hint text-[11px] px-1 py-2 italic text-center bg-accent/10 rounded-lg border border-dashed border-border/50">
                {search.trim() ? "无匹配结果" : "暂无技能"}
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedSkills).map(([category, catSkills]) => {
                  const isCatCollapsed = collapsedCategories[category];
                  return (
                    <div key={category} className="space-y-1">
                      {/* 一级分类 */}
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="flex w-full items-center gap-1 px-1 py-1 text-left text-xs font-bold text-muted-foreground/80 hover:text-foreground transition-colors uppercase tracking-wider"
                      >
                        {isCatCollapsed ? (
                          <ChevronRight className="size-3.5 shrink-0 text-hint" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0 text-hint" />
                        )}
                        <span className="truncate">{category}</span>
                        <span className="text-hint font-mono text-[9px] ml-auto bg-accent/40 px-1.5 py-0.5 rounded-full">
                          {catSkills.length}
                        </span>
                      </button>

                      {/* 二级技能 */}
                      {!isCatCollapsed && (
                        <div className="space-y-0.5 pl-2 border-l border-border/20 ml-2">
                          {catSkills.map((skill) => {
                            const isSelected = effectiveId === skill.id;
                            const isExpanded = !!expandedSkills[skill.id];
                            const detail = skillDetails[skill.id];
                            const isDetailLoading = loadingDetails[skill.id];

                            return (
                              <div key={skill.id} className="space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedId(skill.id);
                                    setSelectedFilePath(null);
                                    toggleSkillExpand(skill.id);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-all",
                                    isSelected && selectedFilePath === null
                                      ? "bg-brand/10 text-foreground font-semibold shadow-sm"
                                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                                  )}
                                >
                                  <Puzzle className={cn("size-4 shrink-0", isSelected && "text-brand")} />
                                  <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                                  <Circle
                                    className={cn(
                                      "size-1.5 shrink-0 fill-current",
                                      skill.status === "active" ? "text-success animate-pulse" : "text-hint",
                                    )}
                                  />
                                </button>

                                {/* 三级物理文件树 */}
                                {isExpanded && (
                                  <div className="pl-3.5 py-0.5 space-y-0.5">
                                    {isDetailLoading && (
                                      <div className="text-hint text-[10px] py-1 italic flex items-center gap-1.5 pl-3">
                                        <Loader2 className="size-3 animate-spin text-brand" />
                                        <span>读取文件树…</span>
                                      </div>
                                    )}
                                    {!isDetailLoading && detail && detail.fileTree && (
                                      <div className="space-y-0.5 border-l border-border/30 ml-2 pl-2">
                                        {detail.fileTree.map((item) => (
                                          <FileTreeItem
                                            key={item.path}
                                            item={item}
                                            isSelected={isSelected && selectedFilePath === item.path}
                                            onClick={() => {
                                              if (item.type === "directory") return;
                                              setSelectedId(skill.id);
                                              setSelectedFilePath(item.path);
                                            }}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右侧：技能详情 / 物理文件渲染 */}
          <div className="bg-card border-border min-h-[500px] flex-1 rounded-2xl border p-6 shadow-sm transition-all">
            {selectedSkill ? (
              <SkillDetailPanel
                skill={selectedSkill}
                selectedFilePath={selectedFilePath}
                onSkillUpdated={(updated) => {
                  setSkillDetails((prev) => ({
                    ...prev,
                    [updated.id]: updated,
                  }));
                  loadSkills();
                }}
                onSkillDeleted={() => {
                  setSelectedId(null);
                  setSelectedFilePath(null);
                  loadSkills();
                }}
              />
            ) : (
              <EmptyState
                icon={Puzzle}
                title="暂无选中技能"
                description="请从左侧列表选择一个技能以查看详细规格及文件树"
              />
            )}
          </div>
        </div>
      </div>
      <CreateSkillModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => { loadSkills(); }}
      />
    </PageTransition>
  );
}
