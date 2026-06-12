"use client";

import { useState, useMemo } from "react";
import { Plus, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";

import { MOCK_PROJECTS, MockProject, MockAgent } from "./_data/mock-projects";
import { ProjectCard } from "./_components/project-card";
import { NewProjectDialog } from "./_components/new-project-dialog";

/** 分类筛选维度 */
const FILTER_CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "customer", label: "客户" },
  { key: "order", label: "订单" },
  { key: "region", label: "地区" },
  { key: "product_line", label: "产品线" },
] as const;

/**
 * 项目空间一级大盘页面
 * 布局：顶部栏（左侧标题，右侧"+ 新建空间"按钮） + 分类筛选栏 + 主内容区（3列卡片网格）
 * 支持按客户/订单/地区/产品线分类筛选，支持卡片的本地状态修改与项目空间删除/新建
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<MockProject[]>(MOCK_PROJECTS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // 按分类筛选项目
  const filteredProjects = useMemo(() => {
    if (activeFilter === "all") return projects;
    return projects.filter((p) => p.type === activeFilter);
  }, [projects, activeFilter]);

  // 备选的 mock 智能体，用于新创建项目时随机指派
  const candidateAgents: MockAgent[] = [
    { id: "agent-opt-1", name: "Quincy", avatarColor: "bg-primary text-white" },
    { id: "agent-opt-2", name: "Leon", avatarColor: "bg-brand-blue text-white" },
    { id: "agent-opt-3", name: "Sophia", avatarColor: "bg-success text-white" },
    { id: "agent-opt-4", name: "Marcus", avatarColor: "bg-warning text-white" },
    { id: "agent-opt-5", name: "Victor", avatarColor: "bg-danger text-white" },
    { id: "agent-opt-6", name: "Clara", avatarColor: "bg-brand text-white" },
  ];

  /**
   * 更新项目空间属性（被 ProjectSettingsDialog 回调触发）
   */
  const handleUpdateProject = (id: string, updatedFields: Partial<MockProject>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, ...updatedFields };
        }
        return p;
      })
    );
  };

  /**
   * 删除项目空间（被 ProjectSettingsDialog 回调触发）
   */
  const handleDeleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  /**
   * 新建项目空间
   */
  const handleCreateProject = (newProj: {
    name: string;
    description: string;
    industry: "foreign-trade" | "other";
  }) => {
    // 随机选择 1 至 3 个候选智能体分配给新空间
    const numAgents = Math.floor(Math.random() * 3) + 1; // 1-3
    const shuffled = [...candidateAgents].sort(() => 0.5 - Math.random());
    const assignedAgents = shuffled.slice(0, numAgents);

    const newProject: MockProject = {
      id: `proj-${Date.now()}`,
      name: newProj.name,
      description: newProj.description,
      status: "processing",
      agents: assignedAgents,
      updatedAt: new Date().toISOString(),
      industry: newProj.industry,
      type: "customer",
      country: undefined,
      productLine: undefined,
      tags: [],
    };

    setProjects((prev) => [newProject, ...prev]);
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col p-6 overflow-y-auto">
        {/* 顶部栏：使用通用 PageHeader 并通过 actions 插槽传递新建按钮 */}
        <PageHeader
          title="项目空间"
          description="企业业务的独立运作空间，绑定专属智能体与背景记忆，驱动外贸流程闭环。"
          actions={
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-primary hover:bg-primary/95 text-white rounded-xl px-4 py-2 flex items-center gap-1.5 h-10 shadow-sm"
            >
              <Plus className="size-4" />
              新建空间
            </Button>
          }
        />

        {/* 分类筛选栏 */}
        <div className="flex items-center gap-1.5 pb-4">
          {FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeFilter === cat.key
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 主内容区：卡片网格或空状态 */}
        <div className="flex-1">
          {filteredProjects.length === 0 ? (
            <div className="flex h-[350px] items-center justify-center">
              <EmptyState
                icon={FolderKanban}
                title={projects.length === 0 ? "暂无项目空间" : "该分类下暂无项目"}
                description={
                  projects.length === 0
                    ? "点击右上角新建空间按钮，开始管理您的客户项目、采购订单或展会跟进。"
                    : "尝试其他分类筛选，或创建新的项目空间。"
                }
                action={{
                  label: "新建项目空间",
                  onClick: () => setDialogOpen(true),
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onUpdate={handleUpdateProject}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          )}
        </div>

        {/* 新建项目空间 Dialog 弹窗 */}
        <NewProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreate={handleCreateProject}
        />
      </div>
    </PageTransition>
  );
}
