"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Shield,
  Brain,
  Puzzle,
  Plus,
  X,
  Loader2,
  Sparkles,
  FileText,
  GitBranch,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Receipt,
  Mail,
  Search,
  Wand2,
  TrendingUp,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AUTOMATION_LEVEL_META } from "@/components/common/agent-status-badge";
import type { AutomationLevel } from "@/types";

/** 向导步骤数 */
const TOTAL_STEPS = 5;

/** 步骤定义 */
const STEP_LABELS = [
  "选择模板",
  "角色描述",
  "任务边界",
  "授权配置",
  "绑定技能",
] as const;

/** 内置模板 */
const BUILTIN_TEMPLATES = [
  {
    key: "sales",
    name: "外贸销售助手",
    desc: "客户开发、邮件撰写、需求分析",
    icon: Bot,
  },
  {
    key: "inquiry",
    name: "询盘分拣员",
    desc: "自动分类、NLP 打分、优先级排序",
    icon: Sparkles,
  },
  {
    key: "followup",
    name: "客户跟进员",
    desc: "日程提醒、关怀邮件、活跃度监控",
    icon: UserCheck,
  },
  {
    key: "quotation",
    name: "报价代理",
    desc: "运费核算、阶梯定价、多币种报价",
    icon: Receipt,
  },
  {
    key: "email",
    name: "邮件写作员",
    desc: "高转化率开发信、本地化表达、模板管理",
    icon: Mail,
  },
  {
    key: "document",
    name: "产品资料员",
    desc: "知识库检索、多语言翻译、规格整理",
    icon: FileText,
  },
  {
    key: "market-research",
    name: "市场研究员",
    desc: "竞品监控、行业研报、趋势预测",
    icon: Search,
  },
  {
    key: "risk",
    name: "风险审查员",
    desc: "客户背景调查、合规风险排查",
    icon: Shield,
  },
  {
    key: "blank",
    name: "空白智能体",
    desc: "从零开始，自由定义角色与能力边界",
    icon: GitBranch,
  },
] as const;

/** 模板预填角色映射 */
const TEMPLATE_ROLES: Record<string, string> = {
  sales: "客户开发与跟进",
  inquiry: "自动分类与评级",
  followup: "生命周期维护",
  quotation: "智能生成报价单",
  email: "专业外贸邮件生成",
  document: "整理商品详情与规格",
  "market-research": "竞品与行业趋势分析",
  risk: "客户背景与合规风险排查",
};

/** 预设技能列表（AGENTS.md §4.0 Claude Code Skills 标准） */
const PRESET_SKILLS = [
  { id: "skill-001", label: "开发信写作", desc: "多语种个性化开发信生成" },
  { id: "skill-002", label: "询盘分析", desc: "意图识别、优先级评分、虚假过滤" },
  { id: "skill-003", label: "报价核算", desc: "自动计算运费与阶梯报价" },
  { id: "skill-004", label: "客户画像", desc: "基于历史数据的客户特征提取" },
  { id: "skill-005", label: "市场研报", desc: "竞品分析与行业趋势报告生成" },
  { id: "skill-006", label: "邮件跟进", desc: "基于生命周期的自动跟进邮件" },
  { id: "skill-007", label: "多语言翻译", desc: "产品资料与沟通内容翻译" },
  { id: "skill-008", label: "风控扫描", desc: "合规风险与信用评估" },
];

/** 预设连接器列表 */
const PRESET_CONNECTORS = [
  { id: "conn-001", label: "Gmail", desc: "邮件收发与归档" },
  { id: "conn-002", label: "Outlook 365", desc: "企业邮箱集成" },
  { id: "conn-003", label: "CRM HubSpot", desc: "客户关系数据同步" },
  { id: "conn-004", label: "Slack", desc: "团队消息通知" },
  { id: "conn-005", label: "Google Sheets", desc: "报价表与数据导出" },
];

/** 表单数据 */
interface AgentFormData {
  templateKey: string
  name: string
  role: string
  description: string
  canDo: string[]
  cannotDo: string[]
  automationLevel: AutomationLevel
  memoryPermission: "read" | "read-write" | "none"
  selectedSkills: string[]
  selectedConnectors: string[]
}

const DEFAULT_FORM: AgentFormData = {
  templateKey: "",
  name: "",
  role: "",
  description: "",
  canDo: [],
  cannotDo: [],
  automationLevel: "L2",
  memoryPermission: "read",
  selectedSkills: [],
  selectedConnectors: [],
};

// ── 外贸行业意图预判引导配置 ─────────────────────────────────
// 基于关键词匹配，在用户停止输入1.5秒后触发 LLM 预判
// 同时提供即时关键词联想（无需 LLM，本地匹配）

const INTENT_QUICK_TEMPLATES = [
  {
    keyword: ["开发信", "开发客户", "找客户", "新客户", "陌生客户"],
    icon: "📧",
    label: "外贸客户开发专家",
    preview: "帮我用 PAS/AIDA 框架写开发信，自动研究买家背景，A/B 测试主题行",
    fullDescription: "我需要一个能帮我开发海外新客户的智能体。主要工作包括：根据买家公司名称自动研究背景和痛点，运用 PAS、AIDA 等专业框架生成3套开发信变体，支持英语/德语/西班牙语等多语种，自动A/B测试主题行，并根据回复率数据持续优化模板。"
  },
  {
    keyword: ["询盘", "分拣", "鉴别", "假询盘", "询盘质量"],
    icon: "🔍",
    label: "询盘智能路由官",
    preview: "鉴别询盘真假，S/A/B/C/D 五级评分，自动分配给最合适的跟进同事",
    fullDescription: "我需要一个能快速鉴别询盘真实性和商业价值的智能体。要能识别虚假询盘的20个特征，对询盘进行S/A/B/C/D五级评分，分析买家意图（首购/比价/套价），并自动路由到最合适的销售人员跟进。"
  },
  {
    keyword: ["报价", "报价单", "定价", "价格策略", "压价", "谈判"],
    icon: "💰",
    label: "动态报价策略师",
    preview: "基于成本+竞品+市场三维定价，生成阶梯报价，面对压价自动生成护盘话术",
    fullDescription: "我需要一个帮我制定报价策略的智能体。能根据成本、竞品价格和目标市场自动计算最优报价，生成阶梯报价（MOQ梯度），当买家压价时提供保护利润的谈判话术，并支持不同市场（美国/欧洲/中东/东南亚）的差异化定价。"
  },
  {
    keyword: ["跟进", "催单", "复购", "沉默客户", "客户维护", "流失"],
    icon: "📊",
    label: "客户生命周期经理",
    preview: "从首次接触到复购全程管理，识别流失信号，自动生成个性化跟进内容",
    fullDescription: "我需要一个管理客户跟进全流程的智能体。能规划从首次询盘到复购的跟进序列，识别客户流失信号（突然沉默、缩减采购量），自动生成个性化激活邮件，规划展会前后的跟进节奏。"
  },
  {
    keyword: ["合同", "合规", "制裁", "法务", "条款", "风险"],
    icon: "⚖️",
    label: "跨境法务合规官",
    preview: "审查合同风险条款，查制裁名单，识别出口管制敏感品类，提供谈判修改建议",
    fullDescription: "我需要一个帮我审查贸易合规风险的智能体。能分析买方合同中的风险条款（付款条件/违约条款/仲裁条款），查询OFAC制裁名单 and BIS实体清单，识别出口管制敏感产品，并给出合同谈判修改建议。"
  },
  {
    keyword: ["物流", "货物", "运输", "延误", "港口", "提单", "清关"],
    icon: "🚢",
    label: "供应链可见性官",
    preview: "监控50+在途订单，港口拥堵预警，延误自动起草客户通知，贸易术语责任分析",
    fullDescription: "我需要一个监控货物物流全程的智能体。能同时追踪多个在途订单状态，预警港口拥堵和延误风险，自动起草客户延误通知邮件，分析不同贸易术语（FOB/CIF/DDP）的责任边界。"
  },
  {
    keyword: ["竞争", "竞品", "市场", "情报", "分析", "对手"],
    icon: "🎯",
    label: "竞争情报分析师",
    preview: "从海关数据+LinkedIn分析竞品客户，估算市场份额，识别竞品弱点",
    fullDescription: "我需要一个收集和分析竞争情报的智能体。能通过海关数据分析竞品主要客户和出货量，在LinkedIn追踪竞品动态，估算目标市场的竞争格局，识别竞品的定价弱点和客户服务漏洞。"
  },
  {
    keyword: ["订单", "跟踪", "货款", "回款", "付款", "风险"],
    icon: "📋",
    label: "全链路履单监控官",
    preview: "合同到回款全程监控，付款逾期预警，汇率风险提示，自动催款邮件",
    fullDescription: "我需要一个从合同签订到货款回收全程监控订单的智能体。能追踪每笔订单的生产/发货/清关/签收状态，在付款临近到期时提前提醒，监控汇率波动风险，在逾期时自动生成催款邮件。"
  },
];

// ── 意图匹配函数（本地，无需 LLM）─────────────────────────────
function matchIntentTemplates(input: string) {
  if (!input || input.length < 4) return [];
  const lower = input.toLowerCase();
  return INTENT_QUICK_TEMPLATES.filter(t =>
    t.keyword.some(kw => lower.includes(kw))
  );
}

// ── AI 深度预判 hook（输入停止1.5s后触发）────────────────────
function useIntentPredict(description: string, name: string) {
  const [prediction, setPrediction] = useState<{
    suggestedName?: string
    suggestedRole?: string
    coreNeed?: string
    conversationStarters?: Array<{ label: string; message: string }>
    upgradeHints?: Array<{ title: string; impact: string }>
    confidence?: number
  } | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    if (description.length < 15) {
      setPrediction(null)
      return
    }

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setIsPredicting(true)
      try {
        const res = await fetch("/api/agents/interpret-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIntent: description,
            currentName: name,
            industryPackId: "foreign-trade",
          }),
        })
        const raw = await res.text()
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0])
          setPrediction({
            suggestedName: data.agentDraft?.suggestedName,
            suggestedRole: data.agentDraft?.role,
            coreNeed: data.interpretation?.coreNeed,
            conversationStarters: data.agentDraft?.conversationStarters?.slice(0, 2),
            upgradeHints: data.upgradeHints?.slice(0, 2),
            confidence: data.interpretation?.confidence,
          })
        }
      } catch (e) {
        console.error("Intent predict error", e)
      } finally {
        setIsPredicting(false)
      }
    }, 1500)  // 停止输入1.5秒后触发

    return () => clearTimeout(timerRef.current)
  }, [description, name])

  return { prediction, isPredicting }
}

interface Step2RoleAndDescProps {
  formData: AgentFormData;
  update: <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) => void;
}

function Step2RoleAndDesc({ formData, update }: Step2RoleAndDescProps) {
  // 在 Step2 组件内部添加以下状态
  const [description, setDescription] = useState(formData.description ?? "")
  const [name, setName] = useState(formData.name ?? "")
  const [role, setRole] = useState(formData.role ?? "")

  // 本地关键词匹配（即时，无网络延迟）
  const matchedTemplates = matchIntentTemplates(description)

  // AI 深度预判（1.5s延迟）
  const { prediction, isPredicting } = useIntentPredict(description, name)

  // 当内部状态改变时同步给顶层状态
  useEffect(() => {
    update("description", description)
  }, [description, update])

  useEffect(() => {
    update("name", name)
  }, [name, update])

  useEffect(() => {
    update("role", role)
  }, [role, update])

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
      <h3 className="text-sm font-medium text-foreground">
        角色与描述
      </h3>
      <p className="text-xs text-muted-foreground -mt-2">
        定义智能体的身份与工作意图，系统将据此匹配技能与连接器
      </p>

      {/* ── 渲染：名称输入 ── */}
      <div className="mb-4">
        <label className="text-sm font-medium text-white/70 mb-1.5 block">
          名称 <span className="text-red-400">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：高级邮件助理"
          className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
        />
        {/* AI 建议名称（当 prediction 存在且 name 为空时显示）*/}
        {prediction?.suggestedName && !name && (
          <button
            type="button"
            onClick={() => setName(prediction.suggestedName!)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Sparkles className="size-3 text-indigo-400" />
            AI 建议：{prediction.suggestedName}
            <span className="text-white/30">（点击使用）</span>
          </button>
        )}
      </div>

      {/* ── 渲染：角色输入 ── */}
      <div className="mb-4">
        <label className="text-sm font-medium text-white/70 mb-1.5 block">
          角色 <span className="text-red-400">*</span>
        </label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="例如：客户开发与跟进"
          className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
        />
        {prediction?.suggestedRole && !role && (
          <button
            type="button"
            onClick={() => setRole(prediction.suggestedRole!)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Sparkles className="size-3 text-indigo-400" />
            AI 建议：{prediction.suggestedRole}
            <span className="text-white/30">（点击使用）</span>
          </button>
        )}
      </div>

      {/* ── 渲染：描述/意图输入框（核心升级区域）────────────────────── */}
      <div className="mb-2">
        <label className="text-sm font-medium text-white/70 mb-1.5 block">
          描述 / 意图
          <span className="ml-2 text-xs text-white/30 font-normal">
            越具体，AI 配置得越准
          </span>
        </label>

        {/* 快速模板引导卡片（描述为空时显示）*/}
        {!description && (
          <div className="mb-3">
            <div className="text-xs text-white/30 mb-2 flex items-center gap-1">
              <Wand2 className="size-3 text-white/30" />
              快速选择场景，自动填入描述：
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INTENT_QUICK_TEMPLATES.slice(0, 6).map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => {
                    setDescription(t.fullDescription)
                    if (!name) setName(t.label)
                  }}
                  className="text-left p-2.5 rounded-lg border border-white/10 bg-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all group"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">{t.icon}</span>
                    <span className="text-xs font-medium text-white/70 group-hover:text-white/90 truncate">
                      {t.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/30 leading-relaxed line-clamp-2">
                    {t.preview}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 描述输入框 */}
        <div className="relative">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述该智能体的主要职责与工作意图，越详细越有助于系统精确理解...&#10;&#10;例如：我需要一个能帮我分析竞品价格、在买家压价时提供谈判策略的智能体，主要服务欧美工业配件买家..."
            rows={5}
            maxLength={500}
            className="w-full bg-[#0f0f1a] border border-white/10 rounded-xl px-4 py-3 text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-indigo-500/60 transition-colors text-sm leading-relaxed"
          />

          {/* 字符计数 + AI 状态 */}
          <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
            {isPredicting && (
              <div className="flex items-center gap-1 text-indigo-400/70 text-xs">
                <Loader2 className="size-3 text-indigo-400 animate-spin" />
                AI 分析中
              </div>
            )}
            <span className="text-white/20 text-xs">{description.length}/500</span>
          </div>
        </div>

        {/* 关键词即时匹配提示（本地，无延迟）*/}
        {matchedTemplates.length > 0 && description.length > 4 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/30">检测到场景：</span>
            {matchedTemplates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setDescription(t.fullDescription)}
                className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 transition-all flex items-center gap-1"
              >
                {t.icon} {t.label}
                <ChevronRight className="size-3 text-indigo-300" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI 深度预判结果面板（1.5s后出现）*/}
      {prediction && description.length > 15 && (
        <div className="mt-3 p-3.5 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 rounded-xl space-y-3">
          {/* 置信度头部 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-indigo-500/30 flex items-center justify-center">
                <Brain className="size-3 text-indigo-400" />
              </div>
              <span className="text-xs font-medium text-indigo-300">
                AI 理解了你的意图
              </span>
              {prediction.confidence && (
                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">
                  置信度 {Math.round(prediction.confidence * 100)}%
                </span>
              )}
            </div>
          </div>

          {/* 核心需求解读 */}
          {prediction.coreNeed && (
            <div className="text-xs text-white/60">
              <span className="text-white/40">核心需求：</span>
              {prediction.coreNeed}
            </div>
          )}

          {/* 对话引导案例预览 */}
          {prediction.conversationStarters && prediction.conversationStarters.length > 0 && (
            <div>
              <div className="text-[10px] text-white/30 mb-1.5 flex items-center gap-1">
                <Sparkles className="size-2 text-white/30" />
                将为你生成以下真实案例引导（对话框快捷按钮）：
              </div>
              <div className="space-y-1.5">
                {prediction.conversationStarters.map((cs, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 bg-white/5 rounded-lg"
                  >
                    <div className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500/20 flex items-center justify-center mt-0.5">
                      <span className="text-[9px] text-indigo-400">{i + 1}</span>
                    </div>
                    <div>
                      <div className="text-xs text-white/70 font-medium">{cs.label}</div>
                      <div className="text-[10px] text-white/35 mt-0.5 line-clamp-2">
                        {cs.message?.slice(0, 80)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 升级建议（及时提出）*/}
          {prediction.upgradeHints && prediction.upgradeHints.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center gap-1 text-amber-400/70 text-[10px] mb-1.5">
                <TrendingUp className="size-2.5 text-amber-400/70" />
                创建后可升级的方向：
              </div>
              {prediction.upgradeHints.map((hint, i) => (
                <div key={i} className="text-[10px] text-white/40 flex items-start gap-1.5 mb-1">
                  <span className="text-amber-400/50 mt-0.5">→</span>
                  <span>
                    <span className="text-white/60">{hint.title}：</span>
                    {hint.impact}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Stepper 指示器 */
function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEP_LABELS.map((label, index) => {
        const s = index + 1;
        const isActive = step === s;
        const isDone = step > s;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                  isDone && "bg-primary text-primary-foreground",
                  isActive && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                  !isDone && !isActive && "bg-accent text-hint",
                )}
              >
                {isDone ? (
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                ) : (
                  s
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] mt-1 whitespace-nowrap",
                  isActive ? "text-primary font-medium" : "text-hint",
                )}
              >
                {label}
              </span>
            </div>
            {index < TOTAL_STEPS - 1 && (
              <div
                className={cn(
                  "w-6 h-[2px] mx-1 transition-colors mt-[-14px]",
                  isDone ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 动态字符串列表编辑器 */
function StringListEditor({
  items,
  onChange,
  placeholder,
  label,
}: {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  label: string
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (v && !items.includes(v)) {
      onChange([...items, v]);
      setInput("");
    }
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-9 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={add}
          disabled={!input.trim()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {items.map((item, idx) => (
            <Badge
              key={`${item}-${idx}`}
              variant="secondary"
              className="gap-1 pr-1 text-xs"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="hover:text-danger transition-colors"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function NewAgentDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<AgentFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  /** 更新表单字段 */
  const update = useCallback(
    <K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /** 关闭并重置 */
  const resetAndClose = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setStep(1);
      setForm(DEFAULT_FORM);
      setSubmitting(false);
    }, 300);
  }, []);

  /** 提交创建 */
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          description: form.description,
          status: "idle",
          source: "custom",
          category: form.templateKey !== "blank" ? ["外贸"] : [],
          bindSkills: form.selectedSkills,
          bindConnectors: form.selectedConnectors,
          memoryPermission: form.memoryPermission,
          harnessVersion: "v1.0.0",
          automationLevel: form.automationLevel,
          canDo: form.canDo,
          cannotDo: form.cannotDo,
          statsJson: { todayTasks: 0, successRate: 0, avgDuration: "0s" },
          lastActive: null,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "创建失败");

      toast.success(`智能体「${form.name}」创建成功`, {
        description: `自动化等级 ${form.automationLevel} · ${form.memoryPermission === "read-write" ? "读写记忆" : form.memoryPermission === "read" ? "只读记忆" : "无记忆"} 已生效`,
      });

      // 刷新智能体列表
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      resetAndClose();
    } catch (err) {
      toast.error("创建智能体失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, submitting, queryClient, resetAndClose]);

  /** 渲染当前步骤内容 */
  const renderStepContent = () => {
    switch (step) {
      // ======================== Step 1: 模板选择 ========================
      case 1:
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-sm font-medium text-foreground">
              选择智能体模板
            </h3>
            <p className="text-xs text-muted-foreground -mt-2">
              模板预设角色与能力边界，创建后可随时调整
            </p>
            <div className="grid grid-cols-2 gap-3">
              {BUILTIN_TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon;
                const isSelected = form.templateKey === tmpl.key;
                const isBlank = tmpl.key === "blank";
                return (
                  <button
                    key={tmpl.key}
                    type="button"
                    onClick={() => {
                      update("templateKey", tmpl.key);
                      if (!isBlank) {
                        // 预填模板数据
                        update("name", tmpl.name);
                        update("role", TEMPLATE_ROLES[tmpl.key] ?? tmpl.desc);
                      }
                    }}
                    className={cn(
                      "border rounded-xl p-4 text-left transition-all",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : isBlank
                          ? "border-dashed border-border hover:border-primary/50 bg-card"
                          : "border-border hover:border-primary/50 bg-card",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-6 mb-2",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <p
                      className={cn(
                        "text-sm font-medium mb-0.5",
                        isSelected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {tmpl.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{tmpl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );

      // ======================== Step 2: 角色与描述 ========================
      case 2:
        return <Step2RoleAndDesc formData={form} update={update} />;

      // ======================== Step 3: 任务边界 ========================
      case 3:
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-sm font-medium text-foreground">
              任务边界（Harness Spec）
            </h3>
            <p className="text-xs text-muted-foreground -mt-2">
              明确智能体可执行与禁止执行的任务范围，构成 Harness 安全边界（AGENTS.md §4.7）
            </p>

            <StringListEditor
              label="允许执行（canDo）"
              placeholder="例如：撰写开发信"
              items={form.canDo}
              onChange={(items) => update("canDo", items)}
            />

            <StringListEditor
              label="禁止执行（cannotDo）"
              placeholder="例如：直接操作银行账户"
              items={form.cannotDo}
              onChange={(items) => update("cannotDo", items)}
            />
          </div>
        );

      // ======================== Step 4: 授权配置 ========================
      case 4:
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-sm font-medium text-foreground">
              授权配置
            </h3>
            <p className="text-xs text-muted-foreground -mt-2">
              设定自动化授权等级与记忆访问权限（AGENTS.md §4.7 四级授权体系）
            </p>

            {/* 自动化等级 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">
                自动化授权等级
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["L1", "L2", "L3", "L4"] as AutomationLevel[]).map(
                  (level) => {
                    const meta = AUTOMATION_LEVEL_META[level];
                    const isSel = form.automationLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => {
                          if (level === "L3" || level === "L4") {
                            const msg = level === "L4"
                              ? "【安全警告】L4 级代表完全自主。除严重系统异常外，HermesClaw 将不再对该智能体发起的任何物理写操作（如发信、扣款、调用外部连接器等）进行人工拦截或审批门禁拦截。\n\n您确定要为该智能体授予 L4 级最高自动化权限吗？"
                              : "【安全提示】L3 级为高风险自动化授权。在执行物理写操作前，如果动作风险评定为高危，HermesClaw 将会创建人工审批检查点拦截该动作。\n\n您确定要选择 L3 级吗？";
                            if (!window.confirm(msg)) return;
                          }
                          update("automationLevel", level);
                        }}
                        className={cn(
                          "border rounded-lg p-3 text-left transition-all",
                          isSel
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/30 bg-card",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={cn(
                              "text-xs font-bold px-1.5 py-0.5 rounded",
                              meta.className,
                            )}
                          >
                            {level}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {meta.short}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {meta.desc}
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {/* 记忆权限 */}
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs text-muted-foreground">
                记忆访问权限
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      key: "read",
                      label: "只读",
                      desc: "可读取工作区记忆，不可写入",
                      icon: Brain,
                    },
                    {
                      key: "read-write",
                      label: "读写",
                      desc: "可读取并写入新记忆",
                      icon: Puzzle,
                    },
                    {
                      key: "none",
                      label: "无记忆",
                      desc: "不访问任何工作区记忆",
                      icon: Shield,
                    },
                  ] as const
                ).map((perm) => {
                  const Icon = perm.icon;
                  const isSel = form.memoryPermission === perm.key;
                  return (
                    <button
                      key={perm.key}
                      type="button"
                      onClick={() => update("memoryPermission", perm.key)}
                      className={cn(
                        "border rounded-lg p-3 text-left transition-all",
                        isSel
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/30 bg-card",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5 mb-1.5",
                          isSel ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <p className="text-sm font-medium text-foreground">
                        {perm.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                        {perm.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      // ======================== Step 5: 绑定技能与连接器 ========================
      case 5:
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-sm font-medium text-foreground">
              绑定技能与连接器
            </h3>
            <p className="text-xs text-muted-foreground -mt-2">
              选择该智能体可调用的技能（Claude Code Skills 标准）和外部连接器
            </p>

            {/* 技能选择 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">
                技能（Skill）— 多选
              </label>
              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                {PRESET_SKILLS.map((skill) => {
                  const checked = form.selectedSkills.includes(skill.id);
                  return (
                    <div
                      key={skill.id}
                      className={cn(
                        "flex items-start gap-3 border rounded-lg p-3 transition-colors cursor-pointer",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card hover:border-primary/20",
                      )}
                      onClick={() => {
                        update(
                          "selectedSkills",
                          checked
                            ? form.selectedSkills.filter((s) => s !== skill.id)
                            : [...form.selectedSkills, skill.id],
                        );
                      }}
                    >
                      <Checkbox
                        id={skill.id}
                        checked={checked}
                        onCheckedChange={() => {
                          update(
                            "selectedSkills",
                            checked
                              ? form.selectedSkills.filter((s) => s !== skill.id)
                              : [...form.selectedSkills, skill.id],
                          );
                        }}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <label
                          htmlFor={skill.id}
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {skill.label}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {skill.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 连接器选择 */}
            <div className="flex flex-col gap-2 mt-1">
              <label className="text-xs text-muted-foreground">
                连接器（Connector）— 多选
              </label>
              <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto">
                {PRESET_CONNECTORS.map((conn) => {
                  const checked = form.selectedConnectors.includes(conn.id);
                  return (
                    <div
                      key={conn.id}
                      className={cn(
                        "flex items-start gap-3 border rounded-lg p-2.5 transition-colors cursor-pointer",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card hover:border-primary/20",
                      )}
                      onClick={() => {
                        update(
                          "selectedConnectors",
                          checked
                            ? form.selectedConnectors.filter((c) => c !== conn.id)
                            : [...form.selectedConnectors, conn.id],
                        );
                      }}
                    >
                      <Checkbox
                        id={conn.id}
                        checked={checked}
                        onCheckedChange={() => {
                          update(
                            "selectedConnectors",
                            checked
                              ? form.selectedConnectors.filter((c) => c !== conn.id)
                              : [...form.selectedConnectors, conn.id],
                          );
                        }}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <label
                          htmlFor={conn.id}
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {conn.label}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {conn.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  /** 校验当前步骤 */
  const canNext = (): boolean => {
    switch (step) {
      case 1:
        return form.templateKey !== "";
      case 2:
        return form.name.trim().length > 0 && form.role.trim().length > 0;
      case 3:
        return true; // 任务边界可选
      case 4:
        return true; // 已有默认值
      case 5:
        return true; // 技能/连接器可选
      default:
        return false;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) resetAndClose();
      }}
    >
      <DialogTrigger
        render={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" />
        }
      >
        + 新建智能体
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建智能体</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <Stepper step={step} />
          {renderStepContent()}
        </div>

        {/* 底部导航 */}
        <div className="flex justify-between mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || submitting}
          >
            <ChevronLeft className="size-4 mr-1" />
            上一步
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              下一步
              <ChevronRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                  创建中...
                </>
              ) : (
                "完成创建"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
