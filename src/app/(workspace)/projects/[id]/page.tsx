"use client";

import { useParams } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";

/** 项目空间详情（PRD 10.5） */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <PageTransition>
      <div className="space-y-6 p-6">
        <PageHeader title="项目空间详情" description={`Space ID：${id}`} />
        <EmptyState
          icon={FolderKanban}
          title="项目空间详情页开发中"
          description="任务、文件、动态、聊天与绑定智能体的多标签视图将在此呈现。"
        />
      </div>
    </PageTransition>
  );
}
