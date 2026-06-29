"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  ListTodo,
  ListTodo as ListTodoIcon,
  Plus,
  Clock,
  Trash2,
  Calendar,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectChat } from "./project-chat";
import { ProjectContextPanel } from "./project-context-panel";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-success/10 text-success border-success/20",
  MEDIUM: "bg-info/10 text-info border-info/20",
  HIGH: "bg-warning/10 text-warning border-warning/20",
  URGENT: "bg-danger/10 text-danger border-danger/20",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "未开始",
  IN_PROGRESS: "进行中",
  DONE: "已完成",
  CANCELLED: "已取消",
};

// ============================================================
// 任务 Tab —— 真实接线，展示项目关联的任务列表
// ============================================================
function TasksTabContent() {
  const { id: projectId } = useParams();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // 新建任务表单状态
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newDueAt, setNewDueAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 编辑状态 ID 跟踪
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?projectId=${projectId}`);
      if (!res.ok) throw new Error("获取项目任务失败");
      const json = await res.json();
      return json.data?.tasks || json.tasks || [];
    },
    enabled: !!projectId,
  });

  const tasks = data || [];
  const filtered = statusFilter
    ? tasks.filter((t: any) => t.status === statusFilter)
    : tasks;

  const statusCounts: Record<string, number> = {};
  for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

  // 创建任务提交
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          priority: newPriority,
          projectId,
          dueAt: newDueAt || undefined,
        }),
      });
      if (!res.ok) throw new Error("创建任务失败");
      
      // 成功，重置并刷新
      setNewTitle("");
      setNewDesc("");
      setNewPriority("MEDIUM");
      setNewDueAt("");
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    } catch (err) {
      console.error(err);
      alert("创建任务失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 修改任务属性
  const handleUpdate = async (taskId: string, updates: { status?: string; priority?: string }) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("修改任务属性失败");
      
      // 刷新并收起编辑状态
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      setEditingStatusId(null);
      setEditingPriorityId(null);
    } catch (err) {
      console.error(err);
      alert("修改任务失败，请重试");
    }
  };

  // 删除任务
  const handleDelete = async (taskId: string) => {
    if (!confirm("确定要取消并删除此任务吗？")) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除任务失败");
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    } catch (err) {
      console.error(err);
      alert("删除任务失败，请重试");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* 顶栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground text-sm font-semibold">项目任务 ({tasks.length})</h3>
            <span className="text-hint text-[10px]">从项目空间关联的任务库中实时读取</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer select-none active:scale-[0.98]"
          >
            <Plus className="size-3.5" />
            {showAddForm ? "收起面板" : "创建任务"}
          </button>
        </div>

        {/* 伸缩式新建表单卡片 */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="bg-card border border-border p-4 rounded-xl space-y-3 shadow-sm animate-in slide-in-from-top-2 duration-150">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">任务标题 *</label>
              <input
                type="text"
                required
                placeholder="例如：发信给客户确认订单细节"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">执行细节</label>
              <textarea
                placeholder="在此输入需要执行的步骤或备注信息..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">优先级</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="LOW">低 (LOW)</option>
                  <option value="MEDIUM">中 (MEDIUM)</option>
                  <option value="HIGH">高 (HIGH)</option>
                  <option value="URGENT">紧急 (URGENT)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">截止日期</label>
                <input
                  type="date"
                  value={newDueAt}
                  onChange={(e) => setNewDueAt(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/95 transition-all disabled:opacity-50 select-none active:scale-[0.98]"
              >
                {isSubmitting ? "创建中..." : "确认创建"}
              </button>
            </div>
          </form>
        )}

        {/* 状态筛选 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { value: null, label: "全部", count: tasks.length },
            { value: "OPEN", label: "未开始", count: statusCounts["OPEN"] || 0 },
            { value: "IN_PROGRESS", label: "进行中", count: statusCounts["IN_PROGRESS"] || 0 },
            { value: "DONE", label: "已完成", count: statusCounts["DONE"] || 0 },
            { value: "CANCELLED", label: "已取消", count: statusCounts["CANCELLED"] || 0 },
          ].map((opt) => (
            <button
              key={opt.value ?? "all"}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-lg border whitespace-nowrap transition-colors cursor-pointer select-none",
                statusFilter === opt.value
                  ? "bg-primary/10 text-primary border-primary/30 font-medium"
                  : "bg-accent/30 text-muted-foreground border-border/30 hover:border-border/50",
              )}
            >
              {opt.label}
              {opt.count > 0 && <span className="ml-1 text-[9px] opacity-70">({opt.count})</span>}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-accent/30 rounded-xl animate-pulse border border-border/40" />
            ))}
          </div>
        ) : error ? (
          <div className="border border-danger/20 bg-danger/5 text-danger text-xs rounded-xl p-4 text-center">
            加载失败: {error instanceof Error ? error.message : "未知错误"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center bg-card/10">
            <ListTodoIcon className="size-8 text-hint mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground text-sm">
              {statusFilter ? `暂无 "${STATUS_LABELS[statusFilter] || statusFilter}" 状态的任务` : "该项目空间暂无任务记录"}
            </p>
            <p className="text-hint text-xs mt-1">
              {statusFilter
                ? "切换筛选条件查看其他状态的任务"
                : "关联智能体在执行流程中将自动在此派发任务"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((task: any) => (
              <div
                key={task.id}
                className="bg-card/45 border border-border rounded-xl p-4 hover:border-primary/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 relative group"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground text-sm font-semibold truncate">{task.title}</span>
                    
                    {/* 优先级内联切换 */}
                    <div className="relative">
                      {editingPriorityId === task.id ? (
                        <select
                          autoFocus
                          value={task.priority}
                          onChange={(e) => handleUpdate(task.id, { priority: e.target.value })}
                          onBlur={() => setEditingPriorityId(null)}
                          className="text-[10px] bg-background border border-border rounded px-1 py-0.5 text-foreground focus:outline-none"
                        >
                          <option value="LOW">低 (LOW)</option>
                          <option value="MEDIUM">中 (MEDIUM)</option>
                          <option value="HIGH">高 (HIGH)</option>
                          <option value="URGENT">紧急 (URGENT)</option>
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingPriorityId(task.id)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 hover:brightness-95 transition-all cursor-pointer select-none",
                            PRIORITY_COLORS[task.priority] || "bg-accent text-muted-foreground"
                          )}
                        >
                          {task.priority || "MEDIUM"}
                        </button>
                      )}
                    </div>
                  </div>
                  {task.description && (
                    <p className="text-muted-foreground text-xs leading-relaxed max-w-xl line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs flex-wrap md:flex-nowrap">
                  {/* 截止时间 */}
                  <span className="text-hint font-mono text-[10px] flex items-center gap-1">
                    <Calendar className="size-3 text-hint/60" />
                    {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "无截止"}
                  </span>
                  
                  {/* 状态内联切换 */}
                  <div className="relative">
                    {editingStatusId === task.id ? (
                      <select
                        autoFocus
                        value={task.status}
                        onChange={(e) => handleUpdate(task.id, { status: e.target.value })}
                        onBlur={() => setEditingStatusId(null)}
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5 text-foreground focus:outline-none"
                      >
                        <option value="OPEN">未开始</option>
                        <option value="IN_PROGRESS">进行中</option>
                        <option value="DONE">已完成</option>
                        <option value="CANCELLED">已取消</option>
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingStatusId(task.id)}
                        className={cn(
                          "px-2 py-1 rounded-lg font-medium hover:brightness-95 transition-all cursor-pointer select-none",
                          task.status === "DONE" ? "bg-success/15 text-success" :
                          task.status === "IN_PROGRESS" ? "bg-warning/15 text-warning" :
                          task.status === "CANCELLED" ? "bg-muted text-muted-foreground" :
                          "bg-accent text-foreground"
                        )}
                      >
                        {STATUS_LABELS[task.status] || task.status}
                      </button>
                    )}
                  </div>

                  {/* 删除/软取消任务按钮 */}
                  <button
                    type="button"
                    onClick={() => handleDelete(task.id)}
                    className="p-1.5 rounded-lg text-hint hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 active:scale-95 cursor-pointer select-none"
                    title="取消并删除任务"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectConversationsSidebar() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentLoadId = searchParams.get("load");

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["recent-conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("获取会话列表失败");
      const json = await res.json();
      return json.data?.conversations || json.conversations || [];
    },
    enabled: !!projectId,
  });

  const projectConvs = conversations
    ? conversations.filter((c: any) => c.projectId === projectId)
    : [];

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-sidebar flex-col h-full select-none">
      {/* 新对话按钮 */}
      <div className="p-3 shrink-0">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}`)}
          className={cn(
            "w-full flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-border text-xs font-medium bg-card hover:bg-accent hover:text-foreground text-muted-foreground transition-all duration-150 active:scale-[0.98]"
          )}
        >
          <Plus className="size-3.5" />
          开启新对话
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        <div className="px-2 py-1 flex items-center gap-1.5 mb-1">
          <Clock className="size-3.5 text-hint" />
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">历史对话</span>
          <span className="text-[9px] text-hint ml-auto font-mono">{projectConvs.length}</span>
        </div>

        {isLoading ? (
          <div className="space-y-1.5 p-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-accent/20 rounded-md" />
            ))}
          </div>
        ) : projectConvs.length === 0 ? (
          <p className="text-hint text-[11px] text-center py-8">暂无项目历史对话</p>
        ) : (
          projectConvs.map((c: any) => {
            const activeMatch = currentLoadId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/projects/${projectId}?load=${c.id}`)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors relative group",
                  activeMatch
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                )}
              >
                <MessageSquare className={cn("size-3.5 shrink-0", activeMatch ? "text-primary" : "text-hint")} />
                <span className="text-xs truncate flex-1 leading-normal">{c.title || "未命名对话"}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

/**
 * 项目详情页多标签容器
 * —— 简化版本：仅包含 聊天 / 任务 两个 Tab
 */
export function ProjectTabs() {
  const [activeTab, setActiveTab] = useState("chat");

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Tabs 主区域 */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 min-w-0 flex flex-col h-full gap-0"
        orientation="horizontal"
      >
        {/* 标签导航栏 */}
        <div className="shrink-0 border-b border-border bg-sidebar/50 px-4">
          <TabsList className="bg-transparent border-0 p-0 gap-1 h-10" variant="line">
            <TabsTrigger value="chat" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <MessageSquare className="size-3.5" />
              聊天
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs gap-1.5 px-3 data-active:text-primary">
              <ListTodo className="size-3.5" />
              任务
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 聊天 Tab */}
        <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden flex">
          <ProjectConversationsSidebar />

          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <ProjectChat />
          </main>

          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>

        {/* 任务 Tab */}
        <TabsContent value="tasks" className="flex-1 min-h-0 overflow-hidden flex">
          <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
            <TasksTabContent />
          </main>
          <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
            <ProjectContextPanel />
          </aside>
        </TabsContent>
      </Tabs>
    </div>
  );
}
