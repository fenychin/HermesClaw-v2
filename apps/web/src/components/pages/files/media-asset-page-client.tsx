"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Eye,
  Download,
  Trash2,
  X,
  Mic,
  ImageIcon,
  Video,
  Bot,
  UserPlus,
  AlertTriangle,
  Hash,
  ExternalLink,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatFileSize } from "@/lib/utils";
import { formatRelativeDay } from "@/lib/date-utils";
import type { FileItem, FileSourceType } from "@/types";

/** 文件来源 Badge */
function SourceBadge({ sourceType, taskId }: { sourceType: FileSourceType; taskId: string | null }) {
  if (sourceType === "artifact") {
    // 防御：artifact 类型必须绑定 taskId，否则为数据异常
    if (!taskId) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/5 px-2 py-0.5 text-[11px] font-medium text-danger">
          <AlertTriangle className="size-3" />
          数据异常
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-[11px] font-medium text-brand">
        <Bot className="size-3" />
        AI 生成物
      </span>
    );
  }
  if (!taskId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/5 px-2 py-0.5 text-[11px] font-medium text-warning">
        <AlertTriangle className="size-3" />
        来源未知
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-hint">
      <UserPlus className="size-3" />
      用户上传
    </span>
  );
}

/** 回执 Hash 摘要 */
function ReceiptHashBadge({ hash }: { hash: string | null }) {
  if (!hash) return <span className="text-hint text-[11px]">—</span>;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-hint">
      <Hash className="size-3" />
      {hash.slice(0, 8)}
    </span>
  );
}

interface MediaAssetPageClientProps {
  /** 页面标题 */
  title: string;
  /** 页面描述 */
  description: string;
  /** 分类图标 */
  icon: LucideIcon;
  /** API category 过滤值 */
  category: string;
  /** 面包屑 */
  breadcrumb: { label: string; href?: string }[];
}

/**
 * 多媒体资产页面通用组件（语音库 / 图像库 / 视频库）
 * —— 从 /api/files?category=xxx 拉取数据，复用文件中心追踪展示
 */
export function MediaAssetPageClient({
  title,
  description,
  icon: Icon,
  category,
  breadcrumb,
}: MediaAssetPageClientProps) {
  const router = useRouter();

  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [taskIdFilter, setTaskIdFilter] = useState("");
  const [total, setTotal] = useState(0);

  // 从 API 拉取数据
  useEffect(() => {
    let cancelled = false;
    async function fetchFiles() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ category, limit: "50" });
        const res = await fetch(`/api/files?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setFiles(json.data.files || []);
          setTotal(json.data.total || 0);
        } else {
          // API 降级：使用 mock 数据（开发/演示阶段）
          setError("API 不可用，当前显示演示数据");
          try {
            const { mockFiles } = await import("@/components/pages/files/file-mock-data");
            if (!cancelled) {
              setFiles(mockFiles.filter((f: FileItem) => f.category === category));
              setTotal(0);
            }
          } catch {
            if (!cancelled) setFiles([]);
          }
        }
      } catch {
        if (!cancelled) {
          setError("API 不可用，当前显示演示数据");
          try {
            const { mockFiles } = await import("@/components/pages/files/file-mock-data");
            if (!cancelled) {
              setFiles(mockFiles.filter((f: FileItem) => f.category === category));
              setTotal(0);
            }
          } catch {
            if (!cancelled) setFiles([]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchFiles();
    return () => { cancelled = true; };
  }, [category]);

  // 前端过滤
  const filteredFiles = useMemo(() => {
    let list = [...files];

    if (taskIdFilter.trim()) {
      const taskQ = taskIdFilter.toLowerCase();
      list = list.filter(
        (f) => f.taskId && f.taskId.toLowerCase().includes(taskQ),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)) ||
          (f.receiptHash && f.receiptHash.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [files, searchQuery, taskIdFilter]);

  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} breadcrumb={breadcrumb} />

      {/* 警告横幅 */}
      {error && (
        <div className="bg-warning/10 border border-warning/20 text-warning rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="text-hint absolute left-3 top-1/2 size-4 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="搜索文件名、标签…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="relative w-40">
          <Hash className="text-hint absolute left-3 top-1/2 size-3.5 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="按 taskId…"
            value={taskIdFilter}
            onChange={(e) => setTaskIdFilter(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
          {taskIdFilter && (
            <button
              type="button"
              onClick={() => setTaskIdFilter("")}
              className="text-hint hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="ml-auto text-hint text-xs">
          {total > 0 && <span>{total} 个项目</span>}
        </div>
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 text-brand animate-spin" />
          <span className="text-hint text-sm ml-2">加载中…</span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <EmptyState
          icon={Icon}
          title="没有找到文件"
          description={searchQuery || taskIdFilter ? "尝试调整搜索条件" : "暂无此类文件"}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>文件名</TableHead>
                <TableHead className="w-16">大小</TableHead>
                <TableHead className="w-24">来源</TableHead>
                <TableHead className="w-28">执行证据</TableHead>
                <TableHead className="w-28">更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((file) => (
                <TableRow key={file.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Icon className="size-5 shrink-0 text-muted-foreground" />
                      <span className="text-foreground truncate text-sm font-medium max-w-[320px]">
                        {file.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-hint text-sm tabular-nums">
                    {formatFileSize(file.size)}
                  </TableCell>
                  <TableCell>
                    <SourceBadge sourceType={file.sourceType} taskId={file.taskId} />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {file.taskId ? (
                        <Link
                          href={`/workspace/runs/${file.workflowRunId || ""}`}
                          className="text-brand-blue hover:underline text-[11px] font-mono block truncate max-w-[120px]"
                        >
                          {file.taskId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-hint text-[11px]">—</span>
                      )}
                      <ReceiptHashBadge hash={file.receiptHash} />
                    </div>
                  </TableCell>
                  <TableCell className="text-hint text-sm">
                    {formatRelativeDay(file.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
