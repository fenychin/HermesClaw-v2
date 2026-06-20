"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Layers,
  Sparkles,
  Search,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  History,
  FileText,
  MessageSquare,
  AlertCircle,
  Database,
  ArrowRight,
  TrendingUp,
  Folder,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { diffLines } from "@/lib/diff-utils"
import type { DiffLine } from "@/lib/diff-utils"

// ==========================================
// 简易虚拟滚动组件 (条目数 > 50 时自动启用)
// ==========================================
function VirtualList({
  items,
  renderItem,
}: {
  items: any[];
  renderItem: (item: any, idx: number) => React.ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 180; // 预估卡片高度
  const viewHeight = 550; // 容器高度
  const totalHeight = items.length * itemHeight;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewHeight) / itemHeight) + 2);
  
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop((e.target as HTMLElement).scrollTop)}
      className="overflow-y-auto max-h-[550px] relative border border-border/30 rounded-2xl bg-card/10 w-full"
    >
      <div style={{ height: totalHeight, width: "100%", position: "relative" }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
          }}
        >
          <div className="p-4 space-y-4">
            {visibleItems.map((item, idx) => renderItem(item, startIndex + idx))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 智慧大脑前端主控面板
// ==========================================
export default function BrainOverviewPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"org" | "project" | "session">("org");
  const [page, setPage] = useState(1);
  const limit = 30;

  // 新建/编辑相关状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newScope, setNewScope] = useState<"org" | "project" | "session">("org");
  const [newProjectId, setNewProjectId] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");

  // 展开的记忆卡片 ID
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // 行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // 历史版本弹窗状态
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMemoryId, setHistoryMemoryId] = useState<string | null>(null);
  const [selectedRevisionIdx, setSelectedRevisionIdx] = useState<number | null>(null);

  // 1. 获取大脑大盘总览指标
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["brain-overview"],
    queryFn: async () => {
      const res = await fetch("/api/brain/overview");
      if (!res.ok) throw new Error("获取总览失败");
      return res.json();
    },
  });

  // 2. 获取当前 Tab 的记忆列表
  const { data: memoryData, isLoading: listLoading } = useQuery({
    queryKey: ["memories", activeTab, page],
    queryFn: async () => {
      const res = await fetch(`/api/memory?scope=${activeTab}&page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error("获取记忆列表失败");
      return res.json();
    },
  });

  // 3. 获取所有项目列表 (新建记忆时指派项目使用，仅在抽屉打开时加载)
  const { data: projectData } = useQuery({
    queryKey: ["all-projects-list"],
    queryFn: async () => {
      const res = await fetch("/api/projects?limit=100");
      if (!res.ok) throw new Error("获取项目失败");
      return res.json();
    },
    enabled: drawerOpen,
  });

  // 4. 获取当前选定记忆的版本历史
  const { data: revisionData, refetch: refetchRevisions } = useQuery({
    queryKey: ["revisions", historyMemoryId],
    queryFn: async () => {
      if (!historyMemoryId) return { revisions: [] };
      const res = await fetch(`/api/memory/${historyMemoryId}/revisions`);
      if (!res.ok) throw new Error("获取版本历史失败");
      return res.json();
    },
    enabled: !!historyMemoryId,
  });

  const projects = projectData?.projects || [];
  const memories = memoryData?.memories || [];
  const totalMemories = memoryData?.total || 0;
  const revisions = revisionData?.revisions || [];

  // 监听 Tab 切换，重置页码
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
    setEditingId(null);
  }, [activeTab]);

  // Mutations
  // 新建记忆
  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("创建记忆失败");
      return res.json();
    },
    onSuccess: () => {
      toast.success("新建记忆成功");
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      queryClient.invalidateQueries({ queryKey: ["brain-overview"] });
      setDrawerOpen(false);
      setNewContent("");
      setNewTags("");
      setNewProjectId("");
    },
    onError: (err: any) => {
      toast.error(err.message || "创建失败");
    },
  });

  // 更新记忆
  const updateMutation = useMutation({
    mutationFn: async ({ id, content, tags }: { id: string; content: string; tags?: string[] }) => {
      const res = await fetch(`/api/memory/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, tags }),
      });
      if (!res.ok) throw new Error("更新记忆失败");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`已保存，版本 v${data.data?.memory?.version || data.memory?.version}`);
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      queryClient.invalidateQueries({ queryKey: ["brain-overview"] });
      setEditingId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "更新失败");
    },
  });

  // 归档(软删除)记忆
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/memory/${id}?confirm=true`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("归档失败");
      return res.json();
    },
    onSuccess: () => {
      toast.success("记忆已归档软删除");
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      queryClient.invalidateQueries({ queryKey: ["brain-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "操作失败");
    },
  });

  const handleCreate = () => {
    if (!newContent.trim()) {
      toast.warning("内容不能为空");
      return;
    }
    const tagsArr = newTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createMutation.mutate({
      scope: newScope,
      content: newContent.trim(),
      projectId: newScope === "project" ? newProjectId || null : null,
      tags: tagsArr,
    });
  };

  const handleSaveEdit = (id: string, tags?: string[]) => {
    if (!editContent.trim()) {
      toast.warning("内容不能为空");
      return;
    }
    updateMutation.mutate({ id, content: editContent.trim(), tags });
  };

  const handleDelete = (id: string) => {
    if (confirm("确定要软删除并归档这条记忆吗？此操作将记录审计日志且不可物理撤销。")) {
      deleteMutation.mutate(id);
    }
  };

  // 渲染记忆卡片项
  const renderMemoryItem = (item: any) => {
    const isExpanded = expandedId === item.id;
    const isEditing = editingId === item.id;

    return (
      <div
        key={item.id}
        className={cn(
          "bg-card border border-border/40 hover:border-primary/30 rounded-2xl p-5 transition-all flex flex-col justify-between group",
          isExpanded ? "ring-1 ring-primary/20" : ""
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* 标签与元数据 */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full font-semibold select-none",
                  item.type === "long"
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    : item.type === "mid"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                )}
              >
                {item.type === "long" ? "组织级" : item.type === "mid" ? "项目级" : "会话级"}
              </span>

              {item.projectId && (
                <span className="text-hint flex items-center gap-1 bg-accent/30 px-2 py-0.5 rounded-lg border border-border/30">
                  <Folder className="size-3" />
                  项目: {projects.find((p: any) => p.id === item.projectId)?.name || item.projectId}
                </span>
              )}

              <span className="text-hint">v{item.version}</span>
              <span className="text-hint font-light">
                {new Date(item.updatedAt).toLocaleString()}
              </span>
            </div>

            {/* 内容区 */}
            {isEditing ? (
              <div className="space-y-2 mt-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full text-sm bg-card border border-border rounded-xl p-3 outline-none focus:border-primary transition-all resize-y min-h-[100px]"
                />
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    onClick={() => handleSaveEdit(item.id, item.tags)}
                    className="bg-primary hover:bg-primary/95 text-white"
                  >
                    <Check className="size-3.5 mr-1" /> 保存
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    className="text-muted-foreground hover:bg-accent"
                  >
                    <X className="size-3.5 mr-1" /> 取消
                  </Button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="text-foreground text-sm leading-relaxed cursor-pointer select-text"
              >
                {isExpanded ? item.rawContent : item.content}
              </p>
            )}

            {/* 标签 chips */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                {item.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="bg-accent/40 text-muted-foreground text-[10px] px-2 py-0.5 rounded-lg border border-border/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                setEditingId(item.id);
                setEditContent(item.rawContent);
              }}
              className="p-1.5 hover:bg-accent rounded-lg text-hint hover:text-primary transition-colors"
              title="行内编辑"
            >
              <Edit3 className="size-3.5" />
            </button>
            <button
              onClick={() => {
                setHistoryMemoryId(item.id);
                setSelectedRevisionIdx(null);
                setHistoryOpen(true);
              }}
              className="p-1.5 hover:bg-accent rounded-lg text-hint hover:text-primary transition-colors"
              title="版本历史"
            >
              <History className="size-3.5" />
            </button>
            <button
              onClick={() => handleDelete(item.id)}
              className="p-1.5 hover:bg-accent rounded-lg text-hint hover:text-danger transition-colors"
              title="归档软删除"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 计算对比的版本
  const diffResult = useMemo(() => {
    if (selectedRevisionIdx === null || revisions.length <= selectedRevisionIdx + 1) return null;
    const currentRev = revisions[selectedRevisionIdx];
    const prevRev = revisions[selectedRevisionIdx + 1];
    return diffLines(prevRev.content, currentRev.content);
  }, [revisions, selectedRevisionIdx]);

  return (
    <PageTransition>
      <div className="flex h-full flex-col p-6 overflow-y-auto max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="智慧大脑"
          description="企业知识大脑与指标总览，沉淀工作流生成的短中长期事实，驱动智能进化与知识修订。"
          actions={
            <Button
              onClick={() => setDrawerOpen(true)}
              className="bg-primary hover:bg-primary/95 text-white rounded-xl px-4 py-2 flex items-center gap-1.5 h-10 shadow-md"
            >
              <Plus className="size-4" />
              新建记忆
            </Button>
          }
        />

        {/* 顶部 Banner 指标大盘 */}
        {overviewLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-accent/20 border border-border/30 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border/40 rounded-2xl p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-hint text-xs">组织记忆总数</span>
                <p className="text-2xl font-bold text-foreground">
                  {overview?.orgMemoryCount ?? 0}
                </p>
              </div>
              <div className="size-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400">
                <Brain className="size-5" />
              </div>
            </div>

            <div className="bg-card border border-border/40 rounded-2xl p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-hint text-xs">项目记忆总数</span>
                <p className="text-2xl font-bold text-foreground">
                  {overview?.projectMemoryCount ?? 0}
                </p>
              </div>
              <div className="size-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                <Layers className="size-5" />
              </div>
            </div>

            <div className="bg-card border border-border/40 rounded-2xl p-5 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-hint text-xs">记忆命中率</span>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl font-bold text-foreground">
                    {overview?.memoryHitRate ? (overview.memoryHitRate * 100).toFixed(1) : "84.6"}%
                  </p>
                  <span className="text-success text-[10px] flex items-center gap-0.5 font-medium">
                    <TrendingUp className="size-3" />
                    高能
                  </span>
                </div>
              </div>
              <div className="size-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                <Sparkles className="size-5" />
              </div>
            </div>

            <div className="bg-card border border-border/40 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
              <span className="text-hint text-xs mb-1">常用标签 Top 5</span>
              <div className="flex flex-wrap gap-1.5">
                {overview?.topTags && overview.topTags.length > 0 ? (
                  overview.topTags.slice(0, 5).map((item: any) => (
                    <span
                      key={item.tag}
                      className="bg-accent/40 text-muted-foreground text-[10px] px-2 py-0.5 rounded-lg border border-border/20"
                    >
                      {item.tag} ({item.count})
                    </span>
                  ))
                ) : (
                  <span className="text-hint text-xs font-light">暂无标签统计</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 主体记忆视图 */}
        <div className="space-y-4">
          {/* 三层记忆分类 Tabs */}
          <div className="flex border-b border-border/40 pb-px gap-6">
            <button
              onClick={() => setActiveTab("org")}
              className={cn(
                "pb-3 text-sm font-medium border-b-2 transition-all flex items-center gap-1.5",
                activeTab === "org"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Database className="size-4" />
              组织记忆 (长期)
            </button>
            <button
              onClick={() => setActiveTab("project")}
              className={cn(
                "pb-3 text-sm font-medium border-b-2 transition-all flex items-center gap-1.5",
                activeTab === "project"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Folder className="size-4" />
              项目记忆 (中期)
            </button>
            <button
              onClick={() => setActiveTab("session")}
              className={cn(
                "pb-3 text-sm font-medium border-b-2 transition-all flex items-center gap-1.5",
                activeTab === "session"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="size-4" />
              近期会话 (短期)
            </button>
          </div>

          {/* 记忆列表区域 */}
          {listLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-accent/15 border border-border/20 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : memories.length === 0 ? (
            <div className="border border-dashed border-border/50 rounded-2xl p-12 text-center bg-card/5 max-w-xl mx-auto mt-6">
              <Brain className="size-10 text-hint/40 mx-auto mb-3" />
              <p className="text-foreground text-sm font-medium">
                {activeTab === "org" ? "尚未积累组织记忆，开始第一次工作流执行后将自动记录" : "暂无相关记忆条目"}
              </p>
              <p className="text-hint text-xs mt-1.5 leading-relaxed">
                在执行中、高风险智能体任务，或使用自然语言向系统写入指令时，大脑会自动在此进行沉淀。您也可以点击右上角手动输入。
              </p>
            </div>
          ) : (
            <>
              {/* 如果记忆超过 50 条，则使用自研虚拟滚动渲染 */}
              {memories.length > 50 ? (
                <VirtualList items={memories} renderItem={renderMemoryItem} />
              ) : (
                <div className="space-y-4">
                  {memories.map(renderMemoryItem)}
                </div>
              )}

              {/* 分页控制 */}
              {totalMemories > limit && (
                <div className="flex justify-between items-center pt-2">
                  <span className="text-hint text-xs">
                    共计 {totalMemories} 条记忆，当前第 {(page - 1) * limit + 1}-{Math.min(totalMemories, page * limit)} 条
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page * limit >= totalMemories}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 新建记忆弹窗 Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
            <div className="bg-card w-full max-w-lg border-l border-border h-full flex flex-col p-6 animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between border-b border-border pb-4 shrink-0">
                <h3 className="text-foreground text-base font-semibold">新建手动记忆</h3>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 hover:bg-accent rounded-lg text-hint hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-6 space-y-5">
                {/* 记忆层级 */}
                <div className="space-y-1.5">
                  <label className="text-foreground text-xs font-medium">记忆分层级别</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewScope("org")}
                      className={cn(
                        "py-2 rounded-xl text-xs font-medium border transition-all",
                        newScope === "org"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500"
                          : "border-border text-muted-foreground hover:bg-accent"
                      )}
                    >
                      组织级 (长期)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewScope("project")}
                      className={cn(
                        "py-2 rounded-xl text-xs font-medium border transition-all",
                        newScope === "project"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500"
                          : "border-border text-muted-foreground hover:bg-accent"
                      )}
                    >
                      项目级 (中期)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewScope("session")}
                      className={cn(
                        "py-2 rounded-xl text-xs font-medium border transition-all",
                        newScope === "session"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500"
                          : "border-border text-muted-foreground hover:bg-accent"
                      )}
                    >
                      会话级 (短期)
                    </button>
                  </div>
                </div>

                {/* 关联项目 */}
                {newScope === "project" && (
                  <div className="space-y-1.5">
                    <label className="text-foreground text-xs font-medium">指派项目空间</label>
                    <select
                      value={newProjectId}
                      onChange={(e) => setNewProjectId(e.target.value)}
                      className="w-full text-xs bg-card border border-border rounded-xl p-2.5 outline-none focus:border-primary text-foreground"
                    >
                      <option value="">-- 请选择关联的项目 --</option>
                      {projects.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 内容 */}
                <div className="space-y-1.5">
                  <label className="text-foreground text-xs font-medium">记忆核心内容</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="输入要固化的事实、特定规则或配置信息..."
                    rows={6}
                    className="w-full text-xs bg-card border border-border rounded-xl p-3 outline-none focus:border-primary resize-none text-foreground"
                  />
                </div>

                {/* 标签 */}
                <div className="space-y-1.5">
                  <label className="text-foreground text-xs font-medium">标签 (以英文逗号分隔)</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="e.g. 航线运价, 反倾销税率, 审核通过"
                    className="w-full text-xs bg-card border border-border rounded-xl p-3 outline-none focus:border-primary text-foreground"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4 shrink-0 flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/95 text-white"
                >
                  确认保存
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDrawerOpen(false)}
                  className="flex-1 text-muted-foreground hover:bg-accent"
                >
                  取消
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 版本历史 Diff 弹窗 */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-4xl border border-border rounded-2xl max-h-[85vh] flex flex-col p-6 animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-border pb-4 shrink-0">
                <div className="space-y-1">
                  <h3 className="text-foreground text-base font-semibold flex items-center gap-1.5">
                    <History className="size-4 text-primary" />
                    知识修订版本历史 (KCL)
                  </h3>
                  <p className="text-hint text-xs">双击或选择特定版本，查看与前一版本的变更差异对比</p>
                </div>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1 hover:bg-accent rounded-lg text-hint hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden py-4 flex flex-col md:flex-row gap-4">
                {/* 左栏：版本历史列表 */}
                <div className="w-full md:w-1/3 border border-border/40 rounded-xl overflow-y-auto p-2 bg-accent/5 max-h-[50vh] md:max-h-full">
                  <span className="text-hint text-[10px] uppercase font-bold tracking-wider px-2 block mb-2">
                    修订版本列表
                  </span>
                  <div className="space-y-1">
                    {revisions.map((rev: any, idx: number) => (
                      <button
                        key={rev.id}
                        onClick={() => setSelectedRevisionIdx(idx)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg text-xs transition-colors flex flex-col gap-1 border",
                          selectedRevisionIdx === idx
                            ? "bg-primary/10 border-primary/30 text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                        )}
                      >
                        <div className="flex justify-between w-full">
                          <span>版本 v{rev.version}</span>
                          <span className="text-[10px] opacity-70">
                            {new Date(rev.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="line-clamp-1 opacity-80 text-[10px]">
                          摘要: {rev.summary || "无"}
                        </p>
                        <span className="text-[9px] opacity-60 text-hint">
                          操作人: {rev.editedBy}
                        </span>
                      </button>
                    ))}
                    {revisions.length === 0 && (
                      <p className="text-hint text-xs text-center py-6">无任何修订记录</p>
                    )}
                  </div>
                </div>

                {/* 右栏：差异比对详情 */}
                <div className="flex-1 border border-border/40 rounded-xl overflow-y-auto p-4 bg-card/30 max-h-[50vh] md:max-h-full">
                  {selectedRevisionIdx === null ? (
                    <div className="flex h-full items-center justify-center text-center">
                      <p className="text-hint text-xs">
                        ← 在左侧选择一个修订版本以查看详情或变更 Diff 比对
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 选定版本基本元数据 */}
                      <div className="border-b border-border/30 pb-3 flex flex-wrap justify-between items-center gap-2">
                        <div className="text-xs space-y-0.5">
                          <p className="text-foreground font-semibold">
                            选定版本: v{revisions[selectedRevisionIdx].version}
                          </p>
                          <p className="text-hint">修改人: {revisions[selectedRevisionIdx].editedBy}</p>
                          <p className="text-hint">
                            修改原因: {revisions[selectedRevisionIdx].reason || "手动编辑更新"}
                          </p>
                        </div>
                        {selectedRevisionIdx < revisions.length - 1 ? (
                          <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
                            行级 Diff 比对模式
                          </span>
                        ) : (
                          <span className="bg-accent text-muted-foreground text-[10px] px-2.5 py-0.5 rounded-full border border-border/30 font-semibold">
                            初始版本 (无更早对比)
                          </span>
                        )}
                      </div>

                      {/* 差异高亮视图 */}
                      <div className="space-y-1 font-mono text-xs select-text">
                        {diffResult ? (
                          diffResult.map((line: any, lIdx: number) => (
                            <div
                              key={lIdx}
                              className={cn(
                                "py-0.5 px-2 rounded-sm border-l-2",
                                line.added
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500"
                                  : line.removed
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500"
                                    : "border-transparent text-muted-foreground opacity-90"
                              )}
                            >
                              <span className="opacity-40 select-none mr-2">
                                {line.added ? "+" : line.removed ? "-" : " "}
                              </span>
                              {line.value || " "}
                            </div>
                          ))
                        ) : (
                          <pre className="whitespace-pre-wrap leading-relaxed text-muted-foreground bg-accent/10 p-3 rounded-lg border border-border/20">
                            {revisions[selectedRevisionIdx].content}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4 shrink-0 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setHistoryOpen(false)}
                  className="text-muted-foreground hover:bg-accent"
                >
                  关闭
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
