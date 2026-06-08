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
  Layers,
  Puzzle,
  Plug,
  Mic,
  ImageIcon,
  Video,
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

/** 一级主导航（左侧栏主体，对应 PRD 9.1） */
export const mainNav: NavItem[] = [
  { href: "/foreign-trade", label: "外贸", icon: Ship, description: "外贸行业工作台与专属工作流" },
  { href: "/new", label: "新话题", icon: Sparkles, description: "快速发起需求、对话与任务的超级入口" },
  { href: "/dashboard", label: "动态大盘", icon: LayoutDashboard, description: "行业情报、询盘雷达与经营监测" },
  { href: "/agents", label: "智能体", icon: Bot, description: "创建、管理与升级企业数字员工" },
  { href: "/projects", label: "项目空间", icon: FolderKanban, description: "面向客户 / 订单 / 市场的 AI 工作单元" },
  { href: "/brain", label: "智慧大脑", icon: Brain, description: "记忆、技能与连接器的控制面中枢" },
  { href: "/files", label: "文件", icon: FileText, description: "企业内容供给链与结构化解析" },
  { href: "/recent", label: "最近", icon: Clock, description: "继续最近的对话、任务与项目" },
];

/** 左下角固定导航（PRD 9.1：设置固定左下角） */
export const bottomNav: NavItem[] = [
  { href: "/settings", label: "设置", icon: Settings, description: "企业、团队、模型路由与升级审批" },
];

/** 智慧大脑二级导航（PRD 9.2） */
export const brainNav: NavItem[] = [
  { href: "/brain/memory", label: "记忆系统", icon: Layers, description: "短/中/长期三级记忆体系" },
  { href: "/brain/skills", label: "技能 Skill", icon: Puzzle, description: "行业 / 岗位 / 自定义技能与版本管理" },
  { href: "/brain/connectors", label: "连接器 MCP", icon: Plug, description: "邮箱、CRM、ERP 等连接器授权" },
  { href: "/brain/voice", label: "语音库", icon: Mic, description: "品牌声音与多语种语音资产" },
  { href: "/brain/images", label: "图像", icon: ImageIcon, description: "产品图、营销与品牌素材" },
  { href: "/brain/videos", label: "视频", icon: Video, description: "讲解、产品与数字人口播素材" },
];
