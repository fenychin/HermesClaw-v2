"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  XCircle,
  Loader2,
  RotateCw,
} from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { ProjectTabs } from "./_components/project-tabs";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // 获取项目详情
  const { data: detailData, isLoading, error, refetch } = useQuery({
    queryKey: ["project-detail", id],
    queryFn: async () => {
      if (!id) return null;
      return apiClient.getProject(id);
    },
    enabled: !!id,
  });

  const project = detailData?.project;

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="size-8 text-primary animate-spin mx-auto" />
          <p className="text-hint text-xs">正在加载项目空间真实上下文中...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <div className="border border-danger/20 bg-danger/5 rounded-2xl p-8 max-w-md text-center space-y-3">
          <XCircle className="size-10 text-danger mx-auto" />
          <h4 className="text-foreground text-sm font-semibold">项目加载失败</h4>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {error instanceof Error ? error.message : "该项目不存在或无权访问其多租户空间"}
          </p>
          <Button variant="outline" onClick={() => router.push("/projects")} className="text-xs">
            <ArrowLeft className="size-3.5 mr-1" /> 返回项目列表
          </Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "processing":
        return <span className="bg-success/10 text-success text-[10px] px-2 py-0.5 rounded-full font-medium">进行中</span>;
      case "completed":
        return <span className="bg-accent text-muted-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">已完成</span>;
      default:
        return <span className="bg-warning/10 text-warning text-[10px] px-2 py-0.5 rounded-full font-medium">搁置</span>;
    }
  };

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-3rem)] w-full flex-col bg-background overflow-hidden">
        {/* 极简项目顶栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 bg-card/10 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/projects")}
              className="text-hint hover:text-foreground text-xs flex items-center gap-1 transition-colors border border-border/20 rounded-xl px-2.5 py-1.5 bg-background shadow-2xs"
            >
              <ArrowLeft className="size-3.5" />
              返回项目大盘
            </button>
            <div className="h-4 w-px bg-border/40" />
            <h2 className="text-foreground text-sm font-semibold flex items-center gap-2">
              {project.name}
              {getStatusBadge(project.status)}
            </h2>
            {project.country && (
              <span className="text-[10px] text-muted-foreground bg-accent/40 border border-border/10 px-2 py-0.5 rounded-lg">
                国别: {project.country}
              </span>
            )}
            {project.relatedClient && (
              <span className="text-[10px] text-muted-foreground bg-accent/40 border border-border/10 px-2 py-0.5 rounded-lg">
                客户: {project.relatedClient}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-8 text-xs gap-1 rounded-xl"
            >
              <RotateCw className="size-3" /> 刷新
            </Button>
          </div>
        </div>

        {/* 撑满的主体区域 */}
        <div className="flex-1 min-h-0">
          <ProjectTabs />
        </div>
      </div>
    </PageTransition>
  );
}
