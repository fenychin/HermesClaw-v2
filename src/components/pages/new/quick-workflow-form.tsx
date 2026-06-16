"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectList,
} from "@/components/ui/select";
import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";

interface QuickWorkflowFormProps {
  cardKey: string;
  onSubmit: (prompt: string, systemPrompt?: string) => void;
  onBack: () => void;
}

type FieldType = 'textarea' | 'text' | 'select';

interface WorkflowField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  rows?: number;
  options?: string[];
}

interface WorkflowConfig {
  key: string;
  title: string;
  subtitle: string;
  systemPromptKey?: keyof typeof TRADE_AGENT_PROMPTS;
  skillTag: string;
  fields: WorkflowField[];
  buildPrompt: (values: Record<string, string>) => string;
}

const WORKFLOW_CONFIGS: ReadonlyArray<WorkflowConfig> = [
  {
    key: "analyze-inquiry",
    title: "分析询盘",
    subtitle: "外贸深度询盘评级与意向分析工作流 · inquiry-grade",
    systemPromptKey: "inquiryAnalysis",
    skillTag: "#inquiry-grade",
    fields: [
      {
        key: "inquiryText",
        label: "询盘原文（直接粘贴邮件原文）",
        type: "textarea",
        required: true,
        rows: 8,
        placeholder: "粘贴完整询盘邮件...",
      },
      {
        key: "productCategory",
        label: "目标产品（选填）",
        type: "text",
        required: false,
        placeholder: "如：太阳能组件、不锈钢板材...",
      },
      {
        key: "clientCompany",
        label: "客户公司（选填）",
        type: "text",
        required: false,
        placeholder: "如：SunTech GmbH",
      },
    ],
    buildPrompt: (values) => `[触发工作流: 分析询盘 · inquiry-grade]
[Skill: #inquiry-grade] [Agent: 询盘分拣员]

请对以下询盘进行深度分析，输出：
1. 客户意向强度评分（0-10分）及评分依据
2. 客户画像速写（规模/类型/采购模式/决策角色）
3. 4维度加权评分表（采购意向/客户质量/需求匹配/响应紧迫性）
4. 推荐跟进优先级（🔴高优/🟡中优/🟢普通）及跟进时间建议
5. 第一封回复邮件框架（英文代码块）
6. 风险提示（如有）

<询盘原文>
${values.inquiryText}
</询盘原文>
<目标产品>${values.productCategory || '未指定'}</目标产品>
<客户公司>${values.clientCompany || '未指定'}</客户公司>`,
  },
  {
    key: "cold-email",
    title: "生成开发信",
    subtitle: "外贸高响应率开发信生成技能 · dev-letter",
    systemPromptKey: "developmentLetter",
    skillTag: "#dev-letter",
    fields: [
      {
        key: "clientBackground",
        label: "客户背景与痛点",
        type: "textarea",
        required: true,
        rows: 4,
        placeholder: "如：欧洲太阳能系统集成商，关注CE认证和快速交付...",
      },
      {
        key: "sellingPoints",
        label: "我方核心优势",
        type: "textarea",
        required: true,
        rows: 3,
        placeholder: "如：CE/DEWA认证，15天交期，MOQ 500pcs...",
      },
      {
        key: "language",
        label: "邮件语言",
        type: "select",
        required: true,
        options: ["英文", "西班牙文", "法文", "德文", "阿拉伯文"],
      },
      {
        key: "tone",
        label: "语气风格",
        type: "select",
        required: true,
        options: ["专业商务", "极简直接", "热情友好", "高端定制"],
      },
    ],
    buildPrompt: (values) => `[触发工作流: 生成开发信 · dev-letter]
[Skill: #dev-letter] [Agent: 开发信写作专家]

请生成一封专业外贸开发信，必须按以下格式输出：

第一部分：主题行 3 选项（标注推荐指数 ★☆☆ 至 ★★★）

第二部分：双语对照正文（必须代码块）
\`\`\`email-cn
[中文版完整邮件]
\`\`\`
\`\`\`email-en
[English version full email]
\`\`\`

第三部分：写作策略说明

第四部分：3-5天后跟进邮件框架

<客户背景>${values.clientBackground}</客户背景>
<核心优势>${values.sellingPoints}</核心优势>
<目标语言>${values.language}</目标语言>
<语气风格>${values.tone}</语气风格>`,
  },
  {
    key: "quotation",
    title: "创建报价单",
    subtitle: "报价策略与定价体系分析工作流 · quote-gen",
    systemPromptKey: "quotation",
    skillTag: "#quote-gen",
    fields: [
      {
        key: "productDetails",
        label: "产品型号、数量及目标价",
        type: "textarea",
        required: true,
        rows: 4,
        placeholder: "如：304不锈钢板 2mm×1220×2440, 20吨, 目标FOB $1800/吨...",
      },
      {
        key: "strategy",
        label: "报价策略",
        type: "select",
        required: true,
        options: ["极致性价比", "高开低走", "阶梯采购折扣", "锚定高端定位"],
      },
      {
        key: "incoterms",
        label: "贸易条款",
        type: "select",
        required: true,
        options: ["FOB", "CIF", "EXW", "DDP", "CFR"],
      },
      {
        key: "paymentTerms",
        label: "付款条件",
        type: "select",
        required: false,
        options: ["T/T 30% 预付", "L/C at sight", "D/P", "OA 30天", "OA 60天"],
      },
    ],
    buildPrompt: (values) => `[触发工作流: 创建报价单 · quote-gen]
[Skill: #quote-gen] [Agent: 报价策略顾问]

请为以下产品设计专业报价策略，输出：
1. 报价区间建议（含底价/目标价/报出价三档）及依据
2. 定价策略解析（为何选择「${values.strategy}」策略的利弊分析）
3. 正式报价单草稿（Markdown 表格格式，含产品规格/数量/单价/总价/贸易条款/付款条件/交货期/有效期）
4. 谈判预案（客户砍价时的让步节奏建议）
5. 风险提示（汇率/原材料波动/合规要求等）

<产品明细>${values.productDetails}</产品明细>
<报价策略>${values.strategy}</报价策略>
<贸易条款>${values.incoterms}</贸易条款>
<付款条件>${values.paymentTerms || '待定'}</付款条件>`,
  },
  {
    key: "client-profile",
    title: "客户画像",
    subtitle: "企业背景穿透与决策链分析工作流 · customer-profile",
    systemPromptKey: "customerProfile",
    skillTag: "#customer-profile",
    fields: [
      {
        key: "companyName",
        label: "客户公司全称或官网",
        type: "text",
        required: true,
        placeholder: "如：Green Energy Systems GmbH 或 www.ges.de",
      },
      {
        key: "knownInfo",
        label: "已知情报与关注痛点（选填）",
        type: "textarea",
        required: false,
        rows: 3,
        placeholder: "如：曾询问CE认证，关注MOQ，参加过慕尼黑太阳能展...",
      },
      {
        key: "region",
        label: "所在国家/地区（选填）",
        type: "text",
        required: false,
        placeholder: "如：德国、中东、东南亚...",
      },
    ],
    buildPrompt: (values) => `[触发工作流: 客户画像 · customer-profile]
[Skill: #customer-profile] [Agent: 客户画像分析师]

请对以下企业进行穿透式客户画像分析，输出：
1. 企业基本画像（规模/类型/主营/市场定位）
2. 决策链分析（采购部门 → 技术评估 → 最终决策者 推测）
3. 采购行为特征（周期/MOQ偏好/价格敏感度/认证要求）
4. 痛点与需求推断（基于行业+地区特征）
5. 推荐沟通策略（语气/切入点/禁忌话题）
6. 合作风险评估（付款风险/行业合规风险）

<公司名称>${values.companyName}</公司名称>
<已知情报>${values.knownInfo || '无'}</已知情报>
<所在国家>${values.region || '未指定'}</所在国家`,
  },
  {
    key: "create-project",
    title: "创建项目空间",
    subtitle: "独立客户订单与交付管理空间建立",
    skillTag: "#project-space",
    fields: [
      {
        key: "projectName",
        label: "空间/项目名称",
        type: "text",
        required: true,
        placeholder: "如：GreenTech 2026 太阳能采购项目",
      },
      {
        key: "associatedClient",
        label: "关联客户（选填）",
        type: "text",
        required: false,
        placeholder: "如：Green Energy Systems GmbH",
      },
      {
        key: "projectType",
        label: "项目类型",
        type: "select",
        required: false,
        options: ["新客户开发", "订单跟进", "样品追踪", "展会跟进", "合同谈判"],
      },
      {
        key: "keyFocus",
        label: "阶段跟进重点（选填）",
        type: "textarea",
        required: false,
        rows: 2,
        placeholder: "如：本周重点：确认样品需求，跟进CE认证文件...",
      },
    ],
    buildPrompt: (values) => `[触发指令: 创建项目空间 · project-space]
[Skill: #project-space] [Agent: Hermes 规划助手]

请帮我规划并建立新的独立工作空间，并输出：
1. 项目空间结构建议（核心任务分组/里程碑节点）
2. 推荐初始任务清单（5-8个立即可执行的具体行动）
3. 关键跟进时间节点建议（含提醒策略）
4. 项目风险预警点（针对该类型项目的常见风险）
5. 推荐关联的数字员工配置（哪些 Agent 适合负责哪些环节）

<空间名称>${values.projectName}</空间名称>
<关联客户>${values.associatedClient || '未指定'}</关联客户>
<项目类型>${values.projectType || '常规订单跟进'}</项目类型>
<阶段重点>${values.keyFocus || '常规订单跟进'}</阶段重点>`,
  },
  {
    key: "call-agent",
    title: "调用智能体",
    subtitle: "协同多智能体编排任务",
    skillTag: "#agent-dispatch",
    fields: [
      {
        key: "targetAgent",
        label: "主智能体",
        type: "select",
        required: true,
        options: ["@Hermes（总规划）", "@Sales Agent（销售）", "@Quincy（询盘专家）", "@Athena（市场情报）", "@Development Agent（开发信）", "@Leon（关税风控）"],
      },
      {
        key: "taskPrompt",
        label: "委派任务描述",
        type: "textarea",
        required: true,
        rows: 5,
        placeholder: "详细描述你希望智能体执行的任务、背景信息和期望输出...",
      },
      {
        key: "outputFormat",
        label: "期望输出格式",
        type: "select",
        required: false,
        options: ["结构化报告", "邮件草稿", "任务清单", "数据分析表", "决策建议"],
      },
    ],
    buildPrompt: (values) => `[触发指令: 智能体编排任务 · agent-dispatch]
[Skill: #agent-dispatch]

我需要调集对应的数字员工协同执行以下任务：

<主智能体>${values.targetAgent}</主智能体>
<期望输出格式>${values.outputFormat || '结构化报告'}</期望输出格式>
<任务描述>
${values.taskPrompt}
</任务描述>

请以「结果优先」原则执行：先给出可直接使用的输出内容，再给出执行依据和注意事项。`,
  },
];

export function QuickWorkflowForm({ cardKey, onSubmit, onBack }: QuickWorkflowFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({});
  }, [cardKey]);

  const config = useMemo(() => {
    return WORKFLOW_CONFIGS.find((c) => c.key === cardKey);
  }, [cardKey]);

  const isValid = useMemo(() => {
    if (!config) return false;
    return config.fields.every((f) => {
      if (!f.required) return true;
      const val = values[f.key];
      return val !== undefined && val.trim().length > 0;
    });
  }, [config, values]);

  if (!config) return null;

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const prompt = config.buildPrompt(values);
    const systemPrompt = config.systemPromptKey
      ? TRADE_AGENT_PROMPTS[config.systemPromptKey]
      : undefined;
    onSubmit(prompt, systemPrompt);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="bg-background/80 backdrop-blur-xl border border-border/60 rounded-2xl p-6 shadow-2xl space-y-6 w-full text-left"
    >
      {/* 头部 Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="p-1 -ml-1 rounded-md hover:bg-accent transition-colors"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
            </button>
            <h3 className="text-base font-semibold text-foreground leading-none">
              {config.title}
            </h3>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">
              {config.skillTag}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {config.subtitle}
          </p>
        </div>
      </div>

      {/* 表单字段渲染 */}
      <div className="space-y-4">
        {config.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-0.5">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </label>

            {field.type === "textarea" && (
              <textarea
                value={values[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={field.rows || 4}
                className="w-full text-xs bg-muted/40 border border-border/60 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50 resize-y transition-all"
                style={{ minHeight: `${(field.rows || 4) * 24}px` }}
              />
            )}

            {field.type === "text" && (
              <input
                type="text"
                value={values[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full h-10 text-xs bg-muted/40 border border-border/60 rounded-xl px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50 transition-all"
              />
            )}

            {field.type === "select" && (
              <Select
                value={values[field.key] || ""}
                onValueChange={(val) => handleChange(field.key, val || "")}
              >
                <SelectTrigger className="w-full h-10 bg-muted/40 border-border/60 rounded-xl px-3 text-xs text-left justify-between flex items-center">
                  <SelectValue placeholder={field.placeholder || "请选择"} />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover border border-border rounded-lg shadow-md p-1 min-w-[var(--anchor-width)]">
                  <SelectList className="flex flex-col gap-0.5 max-h-60 overflow-auto">
                    {field.options?.map((opt) => (
                      <SelectItem key={opt} value={opt} className="relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-2 pr-7 text-xs hover:bg-accent outline-none">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>

      {/* 底部操作区 */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-xs hover:bg-accent h-9 rounded-lg"
        >
          ← 返回
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/75 flex items-center gap-1">
            <Zap className="size-3 text-primary" />
            将自动路由至专属数字员工
          </span>
          <Button
            type="button"
            disabled={!isValid}
            onClick={handleSubmit}
            className="text-xs h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50 disabled:pointer-events-none transition-opacity"
          >
            启动工作流 →
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
