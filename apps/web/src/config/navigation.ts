import type { LucideIcon } from "lucide-react";
import {
  Ship,
  Sparkles,
  LayoutDashboard,
  FolderKanban,
  Brain,
  FileText,
  Clock,
  Settings,
  Radar,
  // 智慧大脑二级图标
  Database,
  Puzzle,
  Plug,
  Mic,
  ImageIcon,
  Video,
  PackageOpen,
  // 设置子导航图标
  ShieldCheck,
  Users,
  Gift,
  Bot,
} from "lucide-react";

/** 单个导航项 */
export interface NavItem {
  /** 路由路径 */
  href: string;
  /** 中文显示名 */
  label: string;
  /** 图标 */
  icon: LucideIcon;
  /** 简短描述（用于 tooltip 与占位页） */
  description?: string;
}

/** 导航板块 */
export interface NavSection {
  /** 板块标题 */
  label: string;
  /** 板块内导航项 */
  items: NavItem[];
}

/** 一级主导航（左侧栏主体，对应 PRD 9.1） */
export const mainNav: NavItem[] = [
  /* ——— 第一板块：系统 ——— */
  { href: "/workspace/chat", label: "新对话", icon: Sparkles, description: "快速发起需求、对话与任务的超级入口" },
  { href: "/brain/memory", label: "智慧大脑", icon: Brain, description: "记忆、技能与连接器的控制面中枢" },
  /* ——— 第二板块：行业 ——— */
  { href: "/foreign-trade", label: "工作台", icon: Ship, description: "行业工作台、专属工作流与动态大盘" },
  { href: "/industry-intelligence", label: "行业舆情", icon: Radar, description: "五板块实时情报中枢大屏" },
  { href: "/projects", label: "空间", icon: FolderKanban, description: "面向客户 / 订单 / 市场的 AI 工作单元" },
  /* ——— 第三板块：资料库 ——— */
  { href: "/files", label: "文件", icon: FileText, description: "企业内容供给链与结构化解析" },
  { href: "/recent", label: "最近", icon: Clock, description: "继续最近的对话、任务与项目" },
];

/** 三板块分组（左侧栏按板块渲染，含分组标题） */
export const navSections: NavSection[] = [
  {
    label: "系统",
    items: [
      mainNav[0], // 新对话
      mainNav[1], // 智慧大脑
    ],
  },
  {
    label: "行业",
    items: [
      mainNav[2], // 工作台
      mainNav[3], // 行业舆情
      mainNav[4], // 项目空间
    ],
  },
  {
    label: "资料库",
    items: [
      mainNav[5], // 文件
      mainNav[6], // 最近
    ],
  },
];

/** 左下角固定导航（PRD 9.1：设置固定左下角） */
export const bottomNav: NavItem[] = [
  { href: "/rewards", label: "推荐奖励", icon: Gift, description: "在 HermesClaw 赚取积分的所有方式" },
  { href: "/settings", label: "设置", icon: Settings, description: "企业、团队、模型路由与升级审批" },
];

/** 智慧大脑二级导航（PRD 9.2） */
export const brainNav: NavItem[] = [
  { href: "/workspace/agents", label: "智能体", icon: Bot, description: "自演化数字员工与智能体库" },
  { href: "/workspace/knowledge", label: "记忆体", icon: Database, description: "短/中/长期三级记忆体统一控制面 · 版本溯源 · 命中统计" },
  { href: "/brain/skills", label: "技能 Skill", icon: Puzzle, description: "行业 / 岗位 / 自定义技能与版本管理" },
  { href: "/brain/connectors", label: "连接器 MCP", icon: Plug, description: "邮箱、CRM、ERP 等连接器授权" },
  { href: "/settings/industry-packs", label: "行业包", icon: PackageOpen, description: "安装、激活与卸载 Industry Pack 行业插件" },
];

/** 资料库二级导航 */
export const knowledgeNav: NavItem[] = [
  { href: "/files", label: "文件中心", icon: FileText, description: "企业内容供给链与结构化解析" },
  { href: "/knowledge/media/voice", label: "语音库", icon: Mic, description: "品牌声音与多语种语音资产" },
  { href: "/knowledge/media/image", label: "图像库", icon: ImageIcon, description: "产品图、营销与品牌素材" },
  { href: "/knowledge/media/video", label: "视频库", icon: Video, description: "讲解、产品与数字人口播素材" },
];

/** 设置子导航（PRD 10.9：Harness 审批独立页面入口） */
export const settingsNav: NavItem[] = [
  { href: "/settings/team", label: "团队与权限", icon: Users, description: "成员、角色与访问控制" },
  { href: "/settings/harness", label: "Harness 审批", icon: ShieldCheck, description: "动态 Harness 升级提案审批中心" },
  { href: "/settings/industry-packs", label: "行业包管理", icon: PackageOpen, description: "安装、激活与卸载 Industry Pack 行业插件" },
];

