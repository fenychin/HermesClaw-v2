"use client";

import { useState, useMemo, useEffect } from "react";
import type { Project, ProjectType, Agent } from "@/types";
import { useProjectStore } from "@/stores/project-store";
import { useAgentStore } from "@/stores/agent-store";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";

import {
  FolderKanban,
  Plus,
  Search,
  AlertCircle,
  Clock,
  Edit,
  Archive,
  Trash2,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Paperclip,
  FileText,
  ImageIcon,
  FileSpreadsheet,
  Download,
  Send,
  User,
  Bot,
  MessageSquare,
  Upload,
  MapPin,
  Building2,
  Calendar,
  Tag,
  Users,
  Package,
  Presentation,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageTransition } from "@/components/common/PageTransition";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

// ============================================================
// 常量
// ============================================================

/** 项目类型映射 */
const TYPE_LABELS: Record<ProjectType | "all", string> = {
  all: "全部",
  customer: "客户",
  order: "订单",
  exhibition: "展会",
  "product-line": "产品线",
};

/** 类型 → 图标 */
const TYPE_ICONS: Record<ProjectType, typeof FolderKanban> = {
  customer: Users,
  order: Package,
  exhibition: Presentation,
  "product-line": Layers,
};

/** 类型 → Badge 样式 */
const TYPE_BADGE_VARIANT: Record<
  ProjectType,
  "default" | "secondary" | "outline" | "destructive"
> = {
  customer: "default",
  order: "secondary",
  exhibition: "outline",
  "product-line": "destructive",
};

/** 常用国家列表 */
const COUNTRIES = [
  "中国", "美国", "德国", "日本", "英国", "法国", "韩国",
  "澳大利亚", "巴西", "阿联酋", "印尼", "加拿大", "多国",
];

/** 相对时间格式化 */
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const weeks = Math.floor(days / 7);
  return `${weeks} 周前`;
}

/** 格式化日期 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ============================================================
// Mock 辅助数据（项目内部子实体，无需持久化）
// ============================================================

/** 硬编码任务 */
const MOCK_TASKS: Record<string, { id: string; title: string; assignee: string; dueDate: string; done: boolean }[]> = {
  "proj-001": [
    { id: "t1", title: "发送修订版报价单给 BrightPath", assignee: "Quincy", dueDate: "2026-06-08", done: true },
    { id: "t2", title: "联系 UL 实验室确认认证更新", assignee: "张伟", dueDate: "2026-06-10", done: false },
    { id: "t3", title: "预订 7 月上海→洛杉矶海运舱位", assignee: "张伟", dueDate: "2026-06-15", done: false },
    { id: "t4", title: "安排样品发货至美国仓库", assignee: "张伟", dueDate: "2026-06-20", done: false },
    { id: "t5", title: "更新产品规格书 UL 认证信息", assignee: "Diana", dueDate: "2026-06-12", done: false },
  ],
  "proj-002": [
    { id: "t1", title: "更新 REACH 合规文档", assignee: "Victor", dueDate: "2026-06-09", done: true },
    { id: "t2", title: "发送 Q3 价格调整通知给 Schmidt", assignee: "李敏", dueDate: "2026-06-12", done: false },
    { id: "t3", title: "安排技术视频会议（表面处理方案）", assignee: "李敏", dueDate: "2026-06-11", done: false },
    { id: "t4", title: "跟进日本供应商表面处理样品", assignee: "李敏", dueDate: "2026-06-18", done: false },
  ],
  "proj-003": [
    { id: "t1", title: "紧急召开品控会议", assignee: "王芳", dueDate: "2026-06-07", done: true },
    { id: "t2", title: "与 Sakura 协商交付时间调整", assignee: "王芳", dueDate: "2026-06-08", done: false },
    { id: "t3", title: "评估模具替代供应商方案", assignee: "王芳", dueDate: "2026-06-14", done: false },
    { id: "t4", title: "第四版样品制作与质检", assignee: "王芳", dueDate: "2026-06-25", done: false },
  ],
  default: [
    { id: "t1", title: "梳理项目关键里程碑", assignee: "负责人", dueDate: "2026-06-10", done: true },
    { id: "t2", title: "准备项目启动材料", assignee: "负责人", dueDate: "2026-06-15", done: false },
    { id: "t3", title: "协调相关智能体资源", assignee: "负责人", dueDate: "2026-06-18", done: false },
  ],
};

/** 硬编码文件 */
interface MockFile {
  name: string;
  type: "pdf" | "doc" | "image" | "sheet";
  size: string;
  updatedAt: string;
}
const MOCK_FILES: Record<string, MockFile[]> = {
  "proj-001": [
    { name: "BrightPath_报价单_v3.pdf", type: "pdf", size: "245 KB", updatedAt: "2026-06-05T16:00:00Z" },
    { name: "UL_认证更新通知.docx", type: "doc", size: "128 KB", updatedAt: "2026-06-04T09:00:00Z" },
    { name: "产品规格书_IP65_2026.xlsx", type: "sheet", size: "560 KB", updatedAt: "2026-06-03T14:00:00Z" },
    { name: "户外灯具_安装示意图.png", type: "image", size: "1.2 MB", updatedAt: "2026-06-01T11:00:00Z" },
  ],
  "proj-002": [
    { name: "Schmidt_Q3价格调整通知.pdf", type: "pdf", size: "180 KB", updatedAt: "2026-06-04T10:00:00Z" },
    { name: "REACH合规检查报告_v2.docx", type: "doc", size: "320 KB", updatedAt: "2026-06-03T08:00:00Z" },
    { name: "精密五金_表面处理方案对比.xlsx", type: "sheet", size: "445 KB", updatedAt: "2026-06-02T16:00:00Z" },
  ],
  default: [
    { name: "项目启动文档.pdf", type: "pdf", size: "156 KB", updatedAt: "2026-06-06T08:00:00Z" },
    { name: "需求文档_v1.docx", type: "doc", size: "89 KB", updatedAt: "2026-06-05T10:00:00Z" },
  ],
};

/** 硬编码聊天记录 */
interface MockMessage {
  role: "ai" | "user";
  content: string;
  time: string;
}
const MOCK_CHAT: Record<string, MockMessage[]> = {
  "proj-001": [
    { role: "user", content: "Quincy，帮我看看 BrightPath 的报价单现在的汇率影响", time: "10:30" },
    { role: "ai", content: "收到。当前 USD/CNY 报 7.2513，相比上次报价（7.1823）有利 0.96%。建议趁汇率窗口尽快发送修订版报价单，我已在后台更新数据。", time: "10:31" },
    { role: "user", content: "好的，顺便确认一下 UL 认证的进展", time: "10:32" },
    { role: "ai", content: "我查询了最新状态：UL 认证更新申请已于 6 月 5 日提交，目前处于实验室测试阶段，预计 6 月 20 日前出结果。但 Leon 提醒，近期 UL 对 IP65 灯具的测试标准有微调，已通知品控部门。", time: "10:33" },
    { role: "user", content: "知道了。先发报价单，认证的事我另外跟进", time: "10:35" },
  ],
  "proj-002": [
    { role: "user", content: "Marcus，Schmidt 那边跟进情况怎么样？", time: "14:00" },
    { role: "ai", content: "一切正常。Schmidt 上个月订单已按时出货，客户在 WhatsApp 上确认收货。下周一安排了技术会议讨论表面处理新方案。需要注意欧元汇率最近波动较大，Quincy 那边建议提前锁定 Q3 汇率。", time: "14:01" },
    { role: "user", content: "好的，REACH 文档更新了没？", time: "14:03" },
    { role: "ai", content: "Victor 已完成 REACH 合规审查，更新了 3 项新物质清单。报告已上传至项目文件区，需要您审阅后发送给客户。", time: "14:04" },
  ],
  default: [
    { role: "user", content: "项目目前进展如何？", time: "09:00" },
    { role: "ai", content: "项目运行正常，所有关联智能体处于活跃状态。如需具体模块进展，可以切换到概览或任务 Tab 查看。", time: "09:01" },
  ],
};

/** 硬编码动态/时间线 */
interface MockActivity {
  icon: typeof CheckCircle2;
  iconColor: string;
  description: string;
  time: string;
}
const MOCK_ACTIVITIES: Record<string, MockActivity[]> = {
  "proj-001": [
    { icon: FileText, iconColor: "text-brand-blue", description: "Quincy 生成了报价单 v3（$68,500）", time: "2026-06-05T16:30:00Z" },
    { icon: AlertTriangle, iconColor: "text-warning", description: "系统预警：UL 认证标准近期有更新", time: "2026-06-05T14:00:00Z" },
    { icon: CheckCircle2, iconColor: "text-success", description: "Leon 完成了 BrightPath 触达邮件 A/B 测试", time: "2026-06-04T10:15:00Z" },
    { icon: MessageSquare, iconColor: "text-brand", description: "Sophia 同步了客户 WhatsApp 沟通记录", time: "2026-06-03T15:00:00Z" },
    { icon: Upload, iconColor: "text-hint", description: "上传了产品规格书 IP65_2026.xlsx", time: "2026-06-03T09:30:00Z" },
  ],
  "proj-002": [
    { icon: FileText, iconColor: "text-brand-blue", description: "Victor 完成了 REACH 合规审查报告", time: "2026-06-04T14:00:00Z" },
    { icon: CheckCircle2, iconColor: "text-success", description: "上月订单按时出货，Schmidt 已确认收货", time: "2026-06-03T11:00:00Z" },
    { icon: AlertTriangle, iconColor: "text-warning", description: "汇率预警：EUR/CNY 单日波动超 1%", time: "2026-06-02T08:30:00Z" },
    { icon: Users, iconColor: "text-brand", description: "Marcus 更新了 Schmidt 客户跟进记录", time: "2026-06-01T16:00:00Z" },
    { icon: Calendar, iconColor: "text-hint", description: "安排了 6 月 9 日技术视频会议", time: "2026-05-30T10:00:00Z" },
  ],
  "proj-003": [
    { icon: AlertTriangle, iconColor: "text-danger", description: "Sakura 第三次样品质检未通过（外观划痕）", time: "2026-06-06T09:15:00Z" },
    { icon: MessageSquare, iconColor: "text-brand", description: "Sophia 收到客户 WhatsApp 紧急反馈", time: "2026-06-06T09:00:00Z" },
    { icon: CheckCircle2, iconColor: "text-success", description: "召开了紧急品控会议并形成决议", time: "2026-06-06T09:45:00Z" },
    { icon: FileText, iconColor: "text-brand-blue", description: "Clara 识别出 3 条真实客户误判虚假询盘", time: "2026-06-05T11:00:00Z" },
    { icon: Package, iconColor: "text-hint", description: "提交了第四版模具方案评估申请", time: "2026-06-04T14:00:00Z" },
  ],
  default: [
    { icon: CheckCircle2, iconColor: "text-success", description: "项目空间已创建", time: "2026-06-06T08:00:00Z" },
    { icon: Users, iconColor: "text-brand", description: "负责人已指定", time: "2026-06-06T09:00:00Z" },
  ],
};

/** 文件类型图标映射 */
function fileTypeIcon(type: MockFile["type"]) {
  switch (type) {
    case "pdf": return <FileText className="size-4 text-danger" />;
    case "doc": return <FileText className="size-4 text-brand-blue" />;
    case "sheet": return <FileSpreadsheet className="size-4 text-success" />;
    case "image": return <ImageIcon className="size-4 text-warning" />;
  }
}

// ============================================================
// 子组件
// ============================================================

/** 左侧项目卡片 */
function ProjectCard({
  project,
  selected,
  onClick,
}: {
  project: Project;
  selected: boolean;
  onClick: () => void;
}) {
  const initial = project.owner.charAt(0).toUpperCase();
  const hasRisk = project.riskPoints.length > 0;
  const Icon = TYPE_ICONS[project.type];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full rounded-xl px-4 py-3 text-left transition-all",
        "hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "bg-accent/40",
      )}
    >
      {/* 选中指示条 */}
      {selected ? (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand" />
      ) : null}

      {/* 标题行 */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-foreground truncate text-sm font-medium">
              {project.name}
            </span>
            <Badge
              variant={TYPE_BADGE_VARIANT[project.type]}
              className="shrink-0 text-[10px]"
            >
              {TYPE_LABELS[project.type]}
            </Badge>
          </div>

          {/* 负责人 */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="bg-accent text-muted-foreground inline-flex size-5 items-center justify-center rounded-full text-[10px] font-medium">
              {initial}
            </span>
            <span className="text-muted-foreground text-xs">{project.owner}</span>
          </div>

          {/* 底部信息行 */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-hint flex items-center gap-1 text-xs">
              <Clock className="size-3" />
              {formatRelativeTime(project.updatedAt)}
            </span>
            {hasRisk ? (
              <span className="inline-flex items-center gap-1 text-xs text-warning">
                <AlertCircle className="size-3" />
                {project.riskPoints.length}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

/** 聊天气泡 */
function ChatBubble({ msg }: { msg: MockMessage }) {
  const isAI = msg.role === "ai";
  return (
    <div className={cn("flex gap-2", isAI ? "justify-start" : "justify-end")}>
      {isAI ? (
        <div className="bg-brand flex size-7 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-3.5 text-white" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isAI
            ? "bg-accent text-foreground rounded-tl-md"
            : "bg-brand text-white rounded-tr-md",
        )}
      >
        <p>{msg.content}</p>
        <p
          className={cn(
            "mt-1 text-xs",
            isAI ? "text-hint" : "text-white/60",
          )}
        >
          {msg.time}
        </p>
      </div>
      {!isAI ? (
        <div className="bg-accent flex size-7 shrink-0 items-center justify-center rounded-full">
          <User className="size-3.5 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// 页面主组件
// ============================================================

export default function ProjectsPage() {
  const {
    projects,
    selectedProjectId,
    searchQuery,
    filter,
    getFilteredProjects,
    loadProjects,
    setSelectedProject,
    setSearchQuery,
    setFilter,
    createProject,
  } = useProjectStore();

  const storeAgents = useAgentStore((s) => s.agents);
  const loadAgents = useAgentStore((s) => s.loadAgents);

  // 挂载时加载项目与智能体
  useEffect(() => {
    loadProjects();
    loadAgents();
  }, [loadProjects, loadAgents]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // 新建项目表单
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<ProjectType>("customer");
  const [formClient, setFormClient] = useState("");
  const [formCountry, setFormCountry] = useState("");
  const [formOwner, setFormOwner] = useState("");

  // 聊天输入
  const [chatInput, setChatInput] = useState("");

  // 筛选后的项目
  const filteredProjects = useMemo(() => getFilteredProjects(), [getFilteredProjects]);

  // 当前选中项目
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  // 关联智能体（从 store 查找）
  const linkedAgents = useMemo(() => {
    if (!selectedProject) return [];
    return selectedProject.activeAgents
      .map((id) => storeAgents.find((a) => a.id === id))
      .filter(Boolean) as Agent[];
  }, [selectedProject, storeAgents]);

  // 辅助数据
  const tasks = selectedProject
    ? (MOCK_TASKS[selectedProject.id] ?? MOCK_TASKS.default)
    : [];
  const files = selectedProject
    ? (MOCK_FILES[selectedProject.id] ?? MOCK_FILES.default)
    : [];
  const chat = selectedProject
    ? (MOCK_CHAT[selectedProject.id] ?? MOCK_CHAT.default)
    : [];
  const activities = selectedProject
    ? (MOCK_ACTIVITIES[selectedProject.id] ?? MOCK_ACTIVITIES.default)
    : [];

  // ---- 新建项目 ----
  const handleCreate = () => {
    if (!formName.trim()) return;
    createProject({
      name: formName.trim(),
      type: formType,
      owner: formOwner.trim() || "未指定",
      relatedClient: formClient.trim() || undefined,
      country: formCountry || undefined,
    });
    // 重置表单
    setFormName("");
    setFormType("customer");
    setFormClient("");
    setFormCountry("");
    setFormOwner("");
    setDialogOpen(false);
  };

  // ---- 切换项目时重置 Tab ----
  const handleSelectProject = (id: string) => {
    setSelectedProject(id);
    setActiveTab("overview");
  };

  return (
    <PageTransition>
    <div className="flex h-full">
      {/* ======================================== */}
      {/* 左侧：项目列表面板（w-72）                */}
      {/* ======================================== */}
      <aside className="border-border bg-sidebar flex w-72 shrink-0 flex-col border-r">
        {/* 搜索框 */}
        <div className="border-border border-b p-3">
          <div className="bg-background ring-border focus-within:ring-ring/30 flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1 transition-all">
            <Search className="size-4 text-hint" />
            <input
              type="text"
              placeholder="搜索项目…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-foreground placeholder:text-hint flex-1 text-sm outline-none"
            />
          </div>
        </div>

        {/* 类型筛选 tabs */}
        <div className="border-border border-b px-3 py-2">
          <div className="flex gap-1">
            {(Object.entries(TYPE_LABELS) as [ProjectType | "all", string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setFilter({ type: key === "all" ? "" : key })
                  }
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    (key === "all" && !filter.type) || filter.type === key
                      ? "bg-brand/10 text-brand"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {/* 项目卡片列表 */}
        <div className="flex-1 overflow-y-auto py-2">
          {filteredProjects.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <FolderKanban className="text-hint mx-auto mb-2 size-8" />
              <p className="text-hint text-xs">暂无匹配项目</p>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                selected={project.id === selectedProjectId}
                onClick={() => handleSelectProject(project.id)}
              />
            ))
          )}
        </div>

        {/* 底部新建按钮 */}
        <div className="border-border border-t p-3">
          <Button
            className="w-full"
            size="sm"
            onClick={() => {
              setFormName("");
              setFormType("customer");
              setFormClient("");
              setFormCountry("");
              setFormOwner("");
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            新建项目空间
          </Button>
        </div>
      </aside>

      {/* ======================================== */}
      {/* 右侧：项目详情 / 空状态                  */}
      {/* ======================================== */}
      <main className="flex-1 overflow-y-auto">
        {!selectedProject ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={FolderKanban}
              title="选择或创建项目空间"
              description="左侧选择一个项目查看详情，或新建一个项目来管理客户、订单、展会与产品线。"
              action={{
                label: "新建项目空间",
                onClick: () => setDialogOpen(true),
              }}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* ---- 详情页头 ---- */}
            <div className="border-border border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* 标题行 */}
                  <div className="flex items-center gap-2">
                    <h1 className="text-foreground truncate text-xl font-bold">
                      {selectedProject.name}
                    </h1>
                    <Badge variant={TYPE_BADGE_VARIANT[selectedProject.type]}>
                      {TYPE_LABELS[selectedProject.type]}
                    </Badge>
                    <StatusBadge
                      status={
                        selectedProject.status === "at-risk"
                          ? "error"
                          : selectedProject.status === "paused"
                            ? "paused"
                            : selectedProject.status === "completed"
                              ? "connected"
                              : "running"
                      }
                    />
                  </div>
                  {/* 国家 / 客户信息 */}
                  <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                    {selectedProject.country ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {selectedProject.country}
                      </span>
                    ) : null}
                    {selectedProject.relatedClient ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3.5" />
                        {selectedProject.relatedClient}
                      </span>
                    ) : null}
                    {selectedProject.productLine ? (
                      <span className="inline-flex items-center gap-1">
                        <Tag className="size-3.5" />
                        {selectedProject.productLine}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm">
                    <Edit className="size-3.5" />
                    编辑
                  </Button>
                  <Button variant="outline" size="sm">
                    <Archive className="size-3.5" />
                    归档
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="text-danger">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* ---- 标签页 ---- */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={(v: string) => setActiveTab(v)}
                className="flex flex-1 flex-col"
              >
                <div className="border-border border-b px-6 py-2">
                  <TabsList variant="line">
                    <TabsTrigger value="overview">概览</TabsTrigger>
                    <TabsTrigger value="tasks">任务</TabsTrigger>
                    <TabsTrigger value="files">文件</TabsTrigger>
                    <TabsTrigger value="chat">聊天</TabsTrigger>
                    <TabsTrigger value="activity">动态</TabsTrigger>
                    <TabsTrigger value="agents">智能体</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {/* ======== 概览 Tab ======== */}
                  <TabsContent value="overview">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {/* 基础信息卡片 */}
                      <Card>
                        <CardHeader>
                          <CardTitle>基础信息</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-hint">负责人</span>
                              <p className="text-foreground mt-0.5 font-medium">
                                {selectedProject.owner}
                              </p>
                            </div>
                            <div>
                              <span className="text-hint">国家/地区</span>
                              <p className="text-foreground mt-0.5 font-medium">
                                {selectedProject.country ?? "未指定"}
                              </p>
                            </div>
                            <div>
                              <span className="text-hint">产品线</span>
                              <p className="text-foreground mt-0.5 font-medium">
                                {selectedProject.productLine ?? "未指定"}
                              </p>
                            </div>
                            <div>
                              <span className="text-hint">创建时间</span>
                              <p className="text-foreground mt-0.5 font-medium">
                                {formatDate(selectedProject.createdAt)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* AI 下一步建议 */}
                      <Card>
                        <CardHeader>
                          <CardTitle>AI 下一步建议</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedProject.nextActions.length > 0 ? (
                            <ul className="space-y-3">
                              {selectedProject.nextActions.slice(0, 3).map((action, i) => (
                                <li
                                  key={i}
                                  className="text-foreground flex items-start gap-2 text-sm"
                                >
                                  <Lightbulb className="text-warning mt-0.5 size-4 shrink-0" />
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-hint text-sm">暂无建议</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* 风险提示 */}
                      <Card>
                        <CardHeader>
                          <CardTitle>风险提示</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedProject.riskPoints.length > 0 ? (
                            <ul className="space-y-3">
                              {selectedProject.riskPoints.map((risk, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2 text-sm"
                                >
                                  <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" />
                                  <span className="text-foreground">{risk}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-hint text-sm">无风险项</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* 关联智能体 */}
                      <Card>
                        <CardHeader>
                          <CardTitle>关联智能体</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {linkedAgents.length > 0 ? (
                            <ul className="space-y-2.5">
                              {linkedAgents.map((agent) => (
                                <li
                                  key={agent.id}
                                  className="flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="bg-accent text-muted-foreground flex size-6 items-center justify-center rounded-full text-[11px] font-medium">
                                      {agent.name.charAt(0)}
                                    </div>
                                    <span className="text-foreground text-sm font-medium">
                                      {agent.name}
                                    </span>
                                    <span className="text-hint text-xs">
                                      {agent.role}
                                    </span>
                                  </div>
                                  <StatusBadge status={agent.status} />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-hint text-sm">暂无关联智能体</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* ======== 任务 Tab ======== */}
                  <TabsContent value="tasks">
                    <div className="mx-auto max-w-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-foreground text-sm font-semibold">
                          任务列表
                        </h3>
                        <Button size="sm" variant="outline">
                          <Plus className="size-3.5" />
                          新增任务
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="bg-card hover:bg-accent/30 flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors"
                          >
                            {task.done ? (
                              <CheckCircle2 className="text-success size-5 shrink-0" />
                            ) : (
                              <Circle className="text-hint size-5 shrink-0" />
                            )}
                            <span
                              className={cn(
                                "flex-1 text-sm",
                                task.done
                                  ? "text-muted-foreground line-through"
                                  : "text-foreground",
                              )}
                            >
                              {task.title}
                            </span>
                            <span className="text-hint text-xs">
                              {task.assignee}
                            </span>
                            <span className="text-hint text-xs">
                              {task.dueDate}
                            </span>
                            <StatusBadge
                              status={task.done ? "connected" : "idle"}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ======== 文件 Tab ======== */}
                  <TabsContent value="files">
                    <div className="mx-auto max-w-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-foreground text-sm font-semibold">
                          项目文件
                        </h3>
                        <Button size="sm" variant="outline">
                          <Upload className="size-3.5" />
                          上传文件
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {files.map((file, i) => (
                          <div
                            key={i}
                            className="bg-card hover:bg-accent/30 flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors"
                          >
                            {fileTypeIcon(file.type)}
                            <div className="min-w-0 flex-1">
                              <p className="text-foreground truncate text-sm font-medium">
                                {file.name}
                              </p>
                              <p className="text-hint text-xs">
                                {file.size} · {formatRelativeTime(file.updatedAt)}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon-sm">
                              <Download className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ======== 聊天 Tab ======== */}
                  <TabsContent value="chat">
                    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 260px)" }}>
                      {/* 对话区 */}
                      <div className="flex-1 space-y-4 overflow-y-auto">
                        {chat.map((msg, i) => (
                          <ChatBubble key={i} msg={msg} />
                        ))}
                      </div>
                      {/* 输入框 */}
                      <div className="border-border mt-4 flex items-center gap-2 border-t pt-4">
                        <button
                          type="button"
                          className="text-hint hover:text-muted-foreground transition-colors"
                        >
                          <Paperclip className="size-4" />
                        </button>
                        <input
                          type="text"
                          placeholder="输入消息…"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          className="bg-accent text-foreground placeholder:text-hint flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && chatInput.trim()) {
                              setChatInput("");
                            }
                          }}
                        />
                        <Button
                          size="icon-sm"
                          disabled={!chatInput.trim()}
                        >
                          <Send className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ======== 动态 Tab ======== */}
                  <TabsContent value="activity">
                    <div className="mx-auto max-w-2xl">
                      <h3 className="text-foreground mb-4 text-sm font-semibold">
                        项目动态
                      </h3>
                      {/* 时间线 */}
                      <div className="relative ml-3 space-y-0">
                        {activities.map((act, i) => (
                          <div
                            key={i}
                            className={cn(
                              "relative flex gap-4 pb-6",
                              i === activities.length - 1 ? "pb-0" : "",
                            )}
                          >
                            {/* 竖线 */}
                            {i < activities.length - 1 ? (
                              <div className="bg-border absolute left-[15px] top-9 bottom-0 w-px" />
                            ) : null}
                            {/* 圆点图标 */}
                            <div
                              className={cn(
                                "bg-card ring-border relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
                                act.iconColor,
                              )}
                            >
                              <act.icon className="size-4" />
                            </div>
                            {/* 内容 */}
                            <div className="min-w-0 flex-1 pt-1">
                              <p className="text-foreground text-sm">
                                {act.description}
                              </p>
                              <p className="text-hint mt-0.5 text-xs">
                                {formatRelativeTime(act.time)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ======== 智能体 Tab ======== */}
                  <TabsContent value="agents">
                    <div className="mx-auto max-w-2xl space-y-4">
                      <h3 className="text-foreground text-sm font-semibold">
                        关联智能体
                      </h3>
                      {linkedAgents.length > 0 ? (
                        <div className="space-y-3">
                          {linkedAgents.map((agent) => (
                            <div
                              key={agent.id}
                              className="bg-card flex items-center gap-4 rounded-xl border border-border px-4 py-3"
                            >
                              {/* 头像 */}
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-blue text-sm font-bold text-white">
                                {agent.name.charAt(0)}
                              </div>
                              {/* 信息 */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-foreground text-sm font-medium">
                                    {agent.name}
                                  </span>
                                  <StatusBadge status={agent.status} />
                                </div>
                                <p className="text-hint truncate text-xs">
                                  {agent.role} · {agent.bindSkills.length} 个技能 · {agent.bindConnectors.length} 个连接器
                                </p>
                              </div>
                              {/* 操作 */}
                              <Button size="sm" variant="outline">
                                <Send className="size-3" />
                                派发任务
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border-border bg-card flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12">
                          <Bot className="text-hint size-8" />
                          <p className="text-hint text-sm">
                            暂无关联智能体
                          </p>
                          <Button size="sm" variant="outline">
                            <Plus className="size-3.5" />
                            绑定智能体
                          </Button>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        )}
      </main>

      {/* ======================================== */}
      {/* 新建项目 Modal                          */}
      {/* ======================================== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建项目空间</DialogTitle>
            <DialogDescription>
              填写以下信息来创建新的项目工作单元
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 项目名称 */}
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                项目名称 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                placeholder="输入项目名称…"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-background ring-border focus:ring-ring/30 text-foreground placeholder:text-hint w-full rounded-lg px-3 py-2 text-sm ring-1 outline-none transition-all"
                autoFocus
              />
            </div>

            {/* 类型选择 */}
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                项目类型
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "customer", label: "客户", desc: "客户项目" },
                    { key: "order", label: "订单", desc: "订单跟进" },
                    { key: "exhibition", label: "展会", desc: "展会线索" },
                    { key: "product-line", label: "产品线", desc: "产品拓展" },
                  ] as const
                ).map(({ key, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormType(key)}
                    className={cn(
                      "ring-border flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-center ring-1 transition-all",
                      formType === key
                        ? "bg-brand/10 ring-brand text-brand"
                        : "bg-background hover:bg-accent/30 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 客户名称 */}
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                客户名称
              </label>
              <input
                type="text"
                placeholder="选填"
                value={formClient}
                onChange={(e) => setFormClient(e.target.value)}
                className="bg-background ring-border focus:ring-ring/30 text-foreground placeholder:text-hint w-full rounded-lg px-3 py-2 text-sm ring-1 outline-none transition-all"
              />
            </div>

            {/* 国家 */}
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                国家
              </label>
              <select
                value={formCountry}
                onChange={(e) => setFormCountry(e.target.value)}
                className="bg-background ring-border focus:ring-ring/30 text-foreground w-full rounded-lg px-3 py-2 text-sm ring-1 outline-none transition-all"
              >
                <option value="">选填</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 负责人 */}
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                负责人
              </label>
              <input
                type="text"
                placeholder="选填，默认为「未指定」"
                value={formOwner}
                onChange={(e) => setFormOwner(e.target.value)}
                className="bg-background ring-border focus:ring-ring/30 text-foreground placeholder:text-hint w-full rounded-lg px-3 py-2 text-sm ring-1 outline-none transition-all"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCreate} disabled={!formName.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
