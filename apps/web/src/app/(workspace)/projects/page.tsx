"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

import { ProjectCard } from "./_components/project-card";
import { NewProjectDialog } from "./_components/new-project-dialog";

/** 分类筛选维度 */
const FILTER_CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "customer", label: "客户" },
  { key: "order", label: "订单" },
  { key: "exhibition", label: "展会" },
  { key: "product-line", label: "产品线" },
] as const;

/**
 * 项目空间一级大盘页面（对接真实 API）
 */
export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // 1. 获取真实项目列表 (包括 active 和 archived)
  const { data: projectData, isLoading, refetch } = useQuery({
    queryKey: ["projects-list"],
    queryFn: () => apiClient.getProjects(),
  });

  const projects = projectData?.projects || [];

  // 按类型过滤项目 (前端内存中进行过滤，响应速度极快)
  const filteredProjects = useMemo(() => {
    if (activeFilter === "all") return projects;
    // 物理的 type 可能是 product-line 或 exhibition 或 customer 或 order
    return projects.filter((p: any) => p.type === activeFilter);
  }, [projects, activeFilter]);

  // 2. 新建项目空间 Mutation
  const createMutation = useMutation({
    mutationFn: (body: any) => apiClient.createProject(body),
    onSuccess: () => {
      toast.success("项目空间创建成功，已初始化专属中期记忆");
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "创建失败");
    },
  });

  // 3. 更新项目 Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: any }) =>
      apiClient.updateProject(id, fields),
    onSuccess: () => {
      toast.success("项目更新成功");
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "更新失败");
    },
  });

  // 4. 删除项目 Mutation (物理删除或软归档)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteProject(id, true),
    onSuccess: () => {
      toast.success("项目已成功删除，关联记忆已自动解绑");
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "删除失败");
    },
  });

  const handleCreateProject = (newProj: {
    name: string;
    description: string;
    industry: "foreign-trade" | "other";
  }) => {
    createMutation.mutate({
      name: newProj.name,
      description: newProj.description,
      industryId: newProj.industry,
      type: "product-line", // 设定一个默认分类
      activeAgents: newProj.industry === "foreign-trade" ? ["Quincy", "Leon"] : [],
    });
  };

  const handleUpdateProject = (id: string, updatedFields: any) => {
    updateMutation.mutate({ id, fields: updatedFields });
  };

  const handleDeleteProject = (id: string) => {
    if (confirm("确定要删除此项目空间吗？删除操作会导致与该项目下的工作流及记忆外键解绑，且将被审计。")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col p-6 overflow-y-auto">
        {/* 顶部栏：使用通用 PageHeader */}
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

        {/* 主内容区 */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-accent/20 border border-border/30 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
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
              {filteredProjects.map((project: any) => {
                // 做一下属性的适配，防止 ProjectCard 内部解析出错
                const adaptedProject = {
                  id: project.id,
                  name: project.name,
                  description: project.description || project.productLine || "",
                  status: project.status === "active" ? "processing" : project.status === "completed" ? "completed" : "on-hold",
                  agents: (() => {
                    const activeAgents = project.activeAgents 
                      ? (typeof project.activeAgents === "string" ? JSON.parse(project.activeAgents) : project.activeAgents)
                      : ["Quincy", "Leon"];
                    const colors = ["bg-primary text-white", "bg-brand-blue text-white", "bg-success text-white"];
                    return activeAgents.map((name: string, index: number) => ({
                      id: `agent-${index}`,
                      name,
                      avatarColor: colors[index % colors.length],
                    }));
                  })(),
                  updatedAt: project.updatedAt || new Date().toISOString(),
                  industry: project.tags?.includes("foreign-trade") ? "foreign-trade" : "other",
                  type: project.type || "customer",
                  relatedClient: project.relatedClient,
                  country: project.country,
                  productLine: project.productLine,
                  tags: project.tags || [],
                };

                return (
                  <ProjectCard
                    key={project.id}
                    project={adaptedProject as any}
                    onUpdate={handleUpdateProject}
                    onDelete={handleDeleteProject}
                  />
                );
              })}
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
