import type { LucideIcon } from "lucide-react";
import {
  Ship,
  Sparkles,
  LayoutDashboard,
  Bot,
  FolderKanban,
  Brain,
  FileText,
  Clock,
  Settings,
  // 智慧大脑二级图标
  Zap,
  Database,
  Archive,
  Puzzle,
  Plug,
  Mic,
  ImageIcon,
  Video,
  // 设置子导航图标
  ShieldCheck,
  Users,
  Gift,
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
  { href: "/foreign-trade", label: "外贸", icon: Ship, description: "外贸行业工作台与专属工作流" },
  { href: "/dashboard", label: "行业动态", icon: LayoutDashboard, description: "行业情报、询盘雷达与经营监测" },
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
      mainNav[2], // 外贸
      mainNav[3], // 动态大盘
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
  { href: "/brain/short-memory", label: "短期记忆", icon: Zap, description: "实时会话上下文与临时任务状态，可清理、可合并" },
  { href: "/brain/mid-memory", label: "中期记忆", icon: Database, description: "项目级与客户级沉淀、阶段性策略，可升级为长期记忆" },
  { href: "/brain/long-memory", label: "长期记忆", icon: Archive, description: "企业 SOP、产品知识与组织级经验库" },
  { href: "/brain/skills", label: "技能 Skill", icon: Puzzle, description: "行业 / 岗位 / 自定义技能与版本管理" },
  { href: "/brain/connectors", label: "连接器 MCP", icon: Plug, description: "邮箱、CRM、ERP 等连接器授权" },
  { href: "/brain/voice", label: "语音库", icon: Mic, description: "品牌声音与多语种语音资产" },
  { href: "/brain/images", label: "图像", icon: ImageIcon, description: "产品图、营销与品牌素材" },
  { href: "/brain/videos", label: "视频", icon: Video, description: "讲解、产品与数字人口播素材" },
];

/** 设置子导航（PRD 10.9：Harness 审批独立页面入口） */
export const settingsNav: NavItem[] = [
  { href: "/settings/team", label: "团队与权限", icon: Users, description: "成员、角色与访问控制" },
  { href: "/settings/harness", label: "Harness 审批", icon: ShieldCheck, description: "动态 Harness 升级提案审批中心" },
];

