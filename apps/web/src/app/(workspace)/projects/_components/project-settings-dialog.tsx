"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Bot,
  Sliders,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface MockProject {
  id: string;
  name: string;
  description: string;
  status: "processing" | "completed" | "on-hold";
}

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: MockProject;
  onUpdate: (project: { name: string; description: string; status?: "processing" | "completed" | "on-hold" }) => void;
  onDelete: (id: string) => void;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  onUpdate,
  onDelete,
}: ProjectSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState("tasks");

  // ---- 状态数据维护 ----
  const [tasks, setTasks] = useState([
    { id: "t-1", title: "跟进北美客户 LED 灯具报价", status: "inprogress", agent: "Quincy (报价员)" },
    { id: "t-2", title: "UL 认证符合性合规审查", status: "completed", agent: "Victor (合规员)" },
    { id: "t-3", title: "检测 REACH 认证更新规范", status: "pending", agent: "Victor (合规员)" },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const [members] = useState([
    { id: "m-1", name: "Frank Feny", role: "项目创建者", isAI: false, status: "online" },
    { id: "m-2", name: "Sarah Lin", role: "外贸业务主管", isAI: false, status: "offline" },
    { id: "m-3", name: "HermesClaw", role: "主策略规划师", isAI: true, status: "online" },
  ]);

  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description);
  const [editStatus, setEditStatus] = useState(project.status);

  // ---- 增加任务 ----
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setTasks((prev) => [
      ...prev,
      {
        id: `t-${Date.now()}`,
        title: newTaskTitle.trim(),
        status: "pending",
        agent: "HermesClaw (主脑)",
      },
    ]);
    setNewTaskTitle("");
  };

  // ---- 切换任务状态 ----
  const toggleTaskStatus = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const nextStatus = t.status === "completed" ? "pending" : t.status === "pending" ? "inprogress" : "completed";
          return { ...t, status: nextStatus };
        }
        return t;
      })
    );
  };

  // ---- 保存设置 ----
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      name: editName,
      description: editDesc,
      status: editStatus,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] rounded-2xl border border-border bg-popover p-6 select-none">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-foreground text-base font-semibold flex items-center gap-2">
            <Sliders className="size-4.5 text-primary" />
            项目空间设置
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs mt-1">
            在这里您可以指派任务、查看空间团队、编辑项目属性或对空间进行归档与删除。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
          <TabsList className="bg-accent/40 border border-border/80 rounded-xl p-1 shrink-0 flex w-full mb-4">
            <TabsTrigger value="tasks" className="flex-1 text-xs py-1.5 rounded-lg">任务看板</TabsTrigger>
            <TabsTrigger value="members" className="flex-1 text-xs py-1.5 rounded-lg">团队成员</TabsTrigger>
            <TabsTrigger value="settings" className="flex-1 text-xs py-1.5 rounded-lg">空间配置</TabsTrigger>
          </TabsList>

          {/* 1. 任务面板 */}
          <TabsContent value="tasks" className="space-y-4">
            {/* 新指派任务 */}
            <form onSubmit={handleAddTask} className="flex gap-2">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="指派新任务，例如：整理海运报关单..."
                className="h-9 text-xs"
              />
              <Button type="submit" size="sm" className="bg-primary text-white h-9 rounded-xl text-xs flex items-center gap-1 shrink-0">
                <Plus className="size-3.5" />
                指派
              </Button>
            </form>

            {/* 任务列表 */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTaskStatus(task.id)}
                  className="bg-card hover:bg-accent/30 border border-border rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button type="button" className="text-muted-foreground shrink-0">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : task.status === "inprogress" ? (
                        <Clock className="size-4 text-warning animate-pulse" />
                      ) : (
                        <Circle className="size-4 text-hint" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <span className={cn(
                        "text-xs block truncate font-medium",
                        task.status === "completed" ? "text-hint line-through" : "text-foreground"
                      )}>
                        {task.title}
                      </span>
                      <span className="text-[9px] text-hint mt-0.5 flex items-center gap-1">
                        <Bot className="size-2.5 text-primary" />
                        执行: {task.agent}
                      </span>
                    </div>
                  </div>
                  <Badge variant={task.status === "completed" ? "secondary" : task.status === "inprogress" ? "default" : "outline"} className="text-[9px] px-1 h-4 shrink-0">
                    {task.status === "completed" ? "已完成" : task.status === "inprogress" ? "进行中" : "待处理"}
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* 2. 团队成员 */}
          <TabsContent value="members" className="space-y-3">
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="bg-card border border-border rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "size-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 relative",
                      member.isAI ? "bg-primary/10 text-primary border border-primary/20" : "bg-accent text-muted-foreground border"
                    )}>
                      {member.isAI ? <Bot className="size-3.5" /> : member.name.charAt(0)}
                      <span className={cn(
                        "absolute bottom-0 right-0 size-2 rounded-full border border-card",
                        member.status === "online" ? "bg-success" : "bg-hint"
                      )} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-foreground">{member.name}</span>
                        {member.isAI && (
                          <Badge className="bg-primary/10 text-primary border-0 text-[8px] px-1 h-3.5">
                            AI 数字员工
                          </Badge>
                        )}
                      </div>
                      <p className="text-[9px] text-hint mt-0.5">{member.role}</p>
                    </div>
                  </div>

                  <Button size="xs" variant="ghost" className="text-[10px] text-hint hover:text-danger hover:bg-danger/10 px-2 rounded-lg">
                    移出
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* 3. 空间配置 */}
          <TabsContent value="settings" className="space-y-5">
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-hint font-medium uppercase tracking-wider">空间名称</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-hint font-medium uppercase tracking-wider">空间描述</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none resize-none focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-hint font-medium uppercase tracking-wider">空间状态</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as MockProject["status"])}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary cursor-pointer w-full h-[36px]"
                >
                  <option value="processing">🟢 进行中 (激活跟进)</option>
                  <option value="completed">⚪ 已完成 (封存归档)</option>
                  <option value="on-hold">🟡 搁置 (挂起暂停)</option>
                </select>
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" size="xs" className="bg-primary text-white h-8 px-4 rounded-xl text-xs">
                  保存配置
                </Button>
              </div>
            </form>

            {/* 危险区 */}
            <div className="border-t border-border pt-4 space-y-2">
              <h4 className="text-danger text-xs font-semibold flex items-center gap-1">
                <ShieldAlert className="size-3.5" />
                危险区域
              </h4>
              <div className="bg-danger/5 border border-danger/10 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-foreground text-xs font-medium">永久删除此空间</p>
                  <p className="text-hint text-[10px] mt-0.5 leading-snug">永久清空空间下的全部聊天、文件与上下文，且不可恢复。</p>
                </div>
                <Button
                  onClick={() => {
                    if (confirm("确定要永久删除此项目空间吗？此操作无法恢复！")) {
                      onDelete(project.id);
                      onOpenChange(false);
                    }
                  }}
                  size="xs"
                  className="bg-danger hover:bg-danger/95 text-white text-[10px] h-7 px-3 rounded-lg"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  删除空间
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
