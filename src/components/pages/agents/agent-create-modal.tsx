"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Ship,
  Globe,
  Factory,
  GraduationCap,
  FileText,
  Search,
  BarChart3,
  Shield,
  Mail,
  Headphones,
  ChevronLeft,
  ChevronRight,
  Puzzle,
  Plug,
  Check,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileCode,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useSkillStore } from "@/stores/skill-store";
import { useConnectorStore } from "@/stores/connector-store";
import type { Agent } from "@/types";

/** 行业选项 */
const INDUSTRIES = [
  {
    key: "foreign-trade",
    name: "外贸",
    icon: Ship,
    description: "进出口贸易全流程数字化",
  },
  { key: "general", name: "通用", icon: Globe, description: "跨行业通用数字员工" },
  {
    key: "manufacturing",
    name: "制造",
    icon: Factory,
    description: "生产制造与供应链管理",
  },
  {
    key: "education",
    name: "教育",
    icon: GraduationCap,
    description: "教育培训与内容服务",
  },
] as const;

/** 岗位模板 */
const ROLE_TEMPLATES = [
  {
    key: "sales-assistant",
    name: "销售助手",
    icon: Headphones,
    description: "全流程销售辅助：线索激活、需求沟通、订单促成",
    defaultSkills: ["skill-001", "skill-002", "skill-008"],
    defaultConnectors: ["conn-001", "conn-008"],
  },
  {
    key: "inquiry-sorter",
    name: "询盘分拣员",
    icon: Search,
    description: "自动分拣入站询盘，识别虚假询盘与高价值线索",
    defaultSkills: ["skill-002", "skill-005"],
    defaultConnectors: ["conn-001", "conn-017"],
  },
  {
    key: "quotation-agent",
    name: "报价代理",
    icon: FileText,
    description: "基于实时汇率与成本数据生成多币种专业报价单",
    defaultSkills: ["skill-003", "skill-008"],
    defaultConnectors: ["conn-018"],
  },
  {
    key: "market-researcher",
    name: "市场研究员",
    icon: BarChart3,
    description: "持续监测行业趋势、竞品动作与政策变化",
    defaultSkills: ["skill-006", "skill-012"],
    defaultConnectors: ["conn-013", "conn-016"],
  },
  {
    key: "risk-reviewer",
    name: "风险审查员",
    icon: Shield,
    description: "审查客户信用、合同条款、支付风险与贸易合规",
    defaultSkills: ["skill-007"],
    defaultConnectors: ["conn-016"],
  },
  {
    key: "email-classifier",
    name: "邮件分类员",
    icon: Mail,
    description: "智能分类企业入站邮件，自动打标路由归档",
    defaultSkills: ["skill-005"],
    defaultConnectors: ["conn-001"],
  },
] as const;

/** 向导步骤定义（Step 3 为 AI Harness Spec 预览） */
type WizardStep = 1 | 2 | 3 | 4 | 5;

/** AI 生成的 Harness Spec JSON 结构 */
interface GeneratedHarnessSpec {
  specVersion: string
  agentRole: string
  taskBoundary: {
    canDo: string[]
    needApproval: string[]
    forbidden: string[]
  }
  contextRequirements: string[]
  toolPermissions: {
    tool: string
    permission: "read" | "write" | "execute"
    level: "L1" | "L2" | "L3" | "L4"
  }[]
  guardrails: {
    rule: string
    action: string
  }[]
  feedbackLoop: {
    successMetric: string
    failureCondition: string
    evolutionTrigger: string
  }
}

interface AgentCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 创建智能体弹窗（4步向导）
 * —— Step 1: 选行业 → Step 2: 选岗位模板 → Step 3: 绑定配置 → Step 4: 确认创建
 */
export function AgentCreateModal({
  open,
  onOpenChange,
}: AgentCreateModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [industry, setIndustry] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [agentName, setAgentName] = useState("");

  // ---- Harness Spec 生成状态（Step 3）----
  const [specGenerating, setSpecGenerating] = useState(false)
  const [specData, setSpecData] = useState<GeneratedHarnessSpec | null>(null)
  const [specMarkdown, setSpecMarkdown] = useState<string>("")
  const [specError, setSpecError] = useState<string | null>(null)
  const [specAccepted, setSpecAccepted] = useState(false)

  const createAgent = useAgentStore((s) => s.createAgent);
  const [creating, setCreating] = useState(false);

  // 技能 / 连接器选项来自真实 store，弹窗打开时按需加载
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const connectors = useConnectorStore((s) => s.connectors);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);
  useEffect(() => {
    if (open) {
      loadSkills();
      loadConnectors();
    }
  }, [open, loadSkills, loadConnectors]);

  /** 获取当前选中模板 */
  const selectedTemplate = ROLE_TEMPLATES.find((t) => t.key === templateKey);

  /** 调用 API 生成 Harness Spec */
  const generateSpec = useCallback(async () => {
    if (!selectedTemplate || !industry) return

    setSpecGenerating(true)
    setSpecError(null)
    setSpecData(null)
    setSpecMarkdown("")
    setSpecAccepted(false)

    try {
      const industryName = INDUSTRIES.find((i) => i.key === industry)?.name ?? industry
      const res = await fetch("/api/harness/generate-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessIntent: selectedTemplate.description,
          industry: industryName,
          agentRole: selectedTemplate.name,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }

      setSpecData(json.data.spec as GeneratedHarnessSpec)
      setSpecMarkdown(json.data.markdown as string)
    } catch (err) {
      setSpecError(err instanceof Error ? err.message : "生成失败")
    } finally {
      setSpecGenerating(false)
    }
  }, [selectedTemplate, industry])

  /** 进入 Step 3 时自动触发 Spec 生成（用 ref 防止重复触发） */
  const specTriggeredRef = useRef<string | null>(null)
  useEffect(() => {
    if (step === 3 && templateKey && specTriggeredRef.current !== templateKey && !specData) {
      specTriggeredRef.current = templateKey
      // 延迟一帧执行避免 setState-in-effect 警告
      const timer = setTimeout(() => generateSpec(), 0)
      return () => clearTimeout(timer)
    }
    // 离开 step 3 时重置触发标记，允许重新进入时再次触发
    if (step !== 3) {
      specTriggeredRef.current = null
    }
  }, [step, templateKey, specData, generateSpec])

  /** 重置所有状态 */
  const reset = () => {
    setStep(1);
    setIndustry(null);
    setTemplateKey(null);
    setSelectedSkills([]);
    setSelectedConnectors([]);
    setAgentName("");
    setSpecData(null)
    setSpecMarkdown("")
    setSpecError(null)
    setSpecAccepted(false)
    setSpecGenerating(false)
  };

  /** 关闭弹窗时重置 */
  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  /** 上一步 */
  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  };

  /** 下一步 */
  const goNext = () => {
    if (step < 5) {
      // Step 4 → Step 5: 填充默认技能与连接器
      if (step === 4 && selectedTemplate) {
        setSelectedSkills([...selectedTemplate.defaultSkills]);
        setSelectedConnectors([...selectedTemplate.defaultConnectors]);
      }
      setStep((s) => (s + 1) as WizardStep);
    }
  };

  /** 创建智能体（调 API） */
  const handleCreate = async () => {
    setCreating(true);
    try {
      await createAgent({
        name: agentName || selectedTemplate?.name || "新智能体",
        role: selectedTemplate?.name || "未指定",
        description: selectedTemplate?.description || "",
        status: "idle",
        source: "custom",
        category: [industry ? INDUSTRIES.find((i) => i.key === industry)?.name ?? "" : "通用"],
        bindSkills: selectedSkills,
        bindConnectors: selectedConnectors,
        memoryPermission: "read-write",
        harnessVersion: specData?.specVersion ?? "1.0.0",
        // 使用 AI 生成的 Harness Spec 的任务边界（AGENTS.md P6 Spec-First）
        canDo: specData?.taskBoundary.canDo ?? ["执行分配的任务", "调用已绑定技能", "访问已授权连接器"],
        cannotDo: [...(specData?.taskBoundary.forbidden ?? []), ...(specData?.taskBoundary.needApproval ?? [])],
        // 将完整 Spec 文档存入描述尾部，供后续 Harness 评估引用
        harnessSpec: specMarkdown || undefined,
        stats: { todayTasks: 0, successRate: 1.0, avgDuration: "—" },
      } as Partial<Agent>);
      handleOpenChange(false);
    } catch {
      // 错误已在 store 中设置
    } finally {
      setCreating(false);
    }
  };


  /** 是否可以继续下一步 */
  const canNext = (() => {
    switch (step) {
      case 1:
        return industry !== null;
      case 2:
        return templateKey !== null;
      case 3:
        // Spec 必须已接受才能进入下一步
        return specAccepted && specData !== null;
      case 4:
        return selectedSkills.length > 0 || selectedConnectors.length > 0;
      case 5:
        return agentName.trim().length > 0;
      default:
        return false;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>创建智能体</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "选择行业领域"
              : step === 2
                ? "选择岗位模板"
                : step === 3
                  ? "AI 生成 Harness Spec — 智能体行为边界文档"
                  : step === 4
                    ? "配置技能与连接器"
                    : "确认并创建"}
          </DialogDescription>
        </DialogHeader>

        {/* ======== 进度指示器 ======== */}
        <div className="flex items-center justify-center gap-2">
          {([1, 2, 3, 4, 5] as WizardStep[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={s > step}
              onClick={() => {
                if (s < step) setStep(s);
              }}
              className={cn(
                "size-2.5 rounded-full transition-all",
                s === step
                  ? "bg-brand scale-125"
                  : s < step
                    ? "bg-brand/40 hover:bg-brand/60"
                    : "bg-accent",
              )}
            >
              <span className="sr-only">步骤 {s}</span>
            </button>
          ))}
        </div>

        <div className="min-h-[280px]">
          {/* ======== Step 1：选行业 ======== */}
          {step === 1 ? (
            <div className="grid grid-cols-2 gap-3">
              {INDUSTRIES.map((ind) => {
                const isSelected = industry === ind.key;
                return (
                  <button
                    key={ind.key}
                    type="button"
                    onClick={() => setIndustry(ind.key)}
                    className={cn(
                      "border-border bg-card flex flex-col items-center gap-2 rounded-card border p-5 text-center transition-all",
                      "hover:bg-accent/50",
                      isSelected && "border-brand ring-1 ring-brand/30 bg-brand/5",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-xl",
                        isSelected ? "bg-brand text-white" : "bg-accent text-muted-foreground",
                      )}
                    >
                      <ind.icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-semibold">
                        {ind.name}
                      </p>
                      <p className="text-hint mt-0.5 text-xs">{ind.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* ======== Step 2：选岗位模板 ======== */}
          {step === 2 ? (
            <div className="grid grid-cols-2 gap-3">
              {ROLE_TEMPLATES.map((tpl) => {
                const isSelected = templateKey === tpl.key;
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setTemplateKey(tpl.key)}
                    className={cn(
                      "border-border bg-card flex flex-col items-center gap-2 rounded-card border p-5 text-center transition-all",
                      "hover:bg-accent/50",
                      isSelected && "border-brand ring-1 ring-brand/30 bg-brand/5",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-xl",
                        isSelected
                          ? "bg-brand text-white"
                          : "bg-accent text-muted-foreground",
                      )}
                    >
                      <tpl.icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-semibold">
                        {tpl.name}
                      </p>
                      <p className="text-hint mt-0.5 text-xs leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* ======== Step 3：Harness Spec 预览（AI 生成）======== */}
          {step === 3 ? (
            <div className="space-y-4">
              {/* 加载中 */}
              {specGenerating ? (
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="bg-brand/10 flex size-14 items-center justify-center rounded-2xl">
                    <Loader2 className="text-brand size-7 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-foreground text-sm font-semibold">
                      Hermes 正在生成 Harness Spec…
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      正在分析 &ldquo;{selectedTemplate?.name ?? ""}&rdquo; 角色的任务边界与安全护栏
                    </p>
                  </div>
                </div>
              ) : specError ? (
                /* 生成失败 */
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="bg-danger/10 flex size-14 items-center justify-center rounded-2xl">
                    <AlertCircle className="text-danger size-7" />
                  </div>
                  <div className="text-center">
                    <p className="text-foreground text-sm font-semibold">Spec 生成失败</p>
                    <p className="text-muted-foreground mt-1 text-xs max-w-[380px]">
                      {specError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={generateSpec}
                    className="bg-brand hover:bg-brand/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                  >
                    <RefreshCw className="size-4" />
                    重新生成
                  </button>
                </div>
              ) : specData ? (
                /* Spec 预览区 */
                <div>
                  {/* 接受 / 重新生成 按钮 */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="bg-success/10 flex size-8 items-center justify-center rounded-lg">
                        <FileCode className="text-success size-4" />
                      </div>
                      <span className="text-foreground text-sm font-semibold">
                        Harness Spec v{specData.specVersion}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={generateSpec}
                        disabled={specGenerating}
                        className="border-border text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        <RefreshCw className="size-3.5" />
                        重新生成
                      </button>
                      {specAccepted ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                          <Check className="size-3.5" />
                          已接受
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSpecAccepted(true)}
                          className="bg-brand hover:bg-brand/90 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
                        >
                          <Check className="size-3.5" />
                          接受 Spec
                        </button>
                      )}
                    </div>
                  </div>

                  {/* JSON Spec 格式化展示 */}
                  <div className="bg-black/30 border-border rounded-xl border p-4 max-h-[340px] overflow-y-auto">
                    {/* 任务边界 */}
                    <div className="mb-3">
                      <h5 className="text-foreground mb-1.5 text-xs font-semibold">
                        📋 任务边界（Task Boundary）
                      </h5>
                      {/* 可以执行 L1/L2 */}
                      <div className="mb-2 rounded-lg bg-success/5 px-2.5 py-1.5">
                        <span className="text-success text-[10px] font-medium">
                          ✅ 可以执行（L1 / L2）
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {specData.taskBoundary.canDo.map((item, i) => (
                            <li
                              key={i}
                              className="text-muted-foreground text-[11px] leading-relaxed"
                            >
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* 需要审批 L3 */}
                      {specData.taskBoundary.needApproval.length > 0 ? (
                        <div className="mb-2 rounded-lg bg-warning/5 px-2.5 py-1.5">
                          <span className="text-warning text-[10px] font-medium">
                            ⚠️ 需要审批（L3）
                          </span>
                          <ul className="mt-1 space-y-0.5">
                            {specData.taskBoundary.needApproval.map((item, i) => (
                              <li
                                key={i}
                                className="text-muted-foreground text-[11px] leading-relaxed"
                              >
                                • {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {/* 绝对禁止 L4 */}
                      {specData.taskBoundary.forbidden.length > 0 ? (
                        <div className="rounded-lg bg-danger/5 px-2.5 py-1.5">
                          <span className="text-danger text-[10px] font-medium">
                            ❌ 绝对禁止（L4）
                          </span>
                          <ul className="mt-1 space-y-0.5">
                            {specData.taskBoundary.forbidden.map((item, i) => (
                              <li
                                key={i}
                                className="text-muted-foreground text-[11px] leading-relaxed"
                              >
                                • {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    {/* 上下文要求 */}
                    {specData.contextRequirements.length > 0 ? (
                      <div className="mb-3">
                        <h5 className="text-foreground mb-1.5 text-xs font-semibold">
                          📚 上下文要求
                        </h5>
                        <ul className="space-y-0.5">
                          {specData.contextRequirements.map((item, i) => (
                            <li
                              key={i}
                              className="text-muted-foreground text-[11px] leading-relaxed"
                            >
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* 工具权限 */}
                    {specData.toolPermissions.length > 0 ? (
                      <div className="mb-3">
                        <h5 className="text-foreground mb-1.5 text-xs font-semibold">
                          🔧 工具权限
                        </h5>
                        <div className="space-y-1">
                          {specData.toolPermissions.map((tp, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded bg-accent/30 px-2.5 py-1"
                            >
                              <code className="text-foreground text-[10px] font-mono">
                                {tp.tool}
                              </code>
                              <span className="text-hint text-[10px]">
                                {tp.permission}
                              </span>
                              <span
                                className={cn(
                                  "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  tp.level === "L1"
                                    ? "bg-success/20 text-success"
                                    : tp.level === "L2"
                                      ? "bg-brand-blue/20 text-brand-blue"
                                      : tp.level === "L3"
                                        ? "bg-warning/20 text-warning"
                                        : "bg-danger/20 text-danger",
                                )}
                              >
                                {tp.level}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* 安全护栏 */}
                    {specData.guardrails.length > 0 ? (
                      <div className="mb-3">
                        <h5 className="text-foreground mb-1.5 text-xs font-semibold">
                          🛡️ 安全护栏
                        </h5>
                        {specData.guardrails.map((g, i) => (
                          <div
                            key={i}
                            className="mb-1 rounded bg-accent/30 px-2.5 py-1"
                          >
                            <p className="text-foreground text-[10px] font-medium">
                              {g.rule}
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-[10px]">
                              → {g.action}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* 反馈闭环 */}
                    <div>
                      <h5 className="text-foreground mb-1.5 text-xs font-semibold">
                        🔄 反馈闭环
                      </h5>
                      <div className="rounded-lg bg-accent/30 px-2.5 py-1.5 space-y-0.5">
                        <p className="text-muted-foreground text-[10px]">
                          <span className="text-foreground font-medium">
                            成功指标：
                          </span>
                          {specData.feedbackLoop.successMetric}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          <span className="text-foreground font-medium">
                            失败条件：
                          </span>
                          {specData.feedbackLoop.failureCondition}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          <span className="text-foreground font-medium">
                            进化触发：
                          </span>
                          {specData.feedbackLoop.evolutionTrigger}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 未接受的提示 */}
                  {!specAccepted ? (
                    <p className="text-hint mt-2 text-center text-xs">
                      请审核 Harness Spec 后点击 &ldquo;接受 Spec&rdquo; 以继续创建
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ======== Step 4：绑定技能 + 连接器 ======== */}
          {step === 4 ? (
            <div className="space-y-4">
              {/* 技能多选 */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Puzzle className="text-brand size-4" />
                  <h4 className="text-foreground text-sm font-semibold">
                    选择技能（{selectedSkills.length} 已选）
                  </h4>
                </div>
                <div className="max-h-[160px] space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {skills.map((skill) => {
                    const isChecked = selectedSkills.includes(skill.id);
                    return (
                      <label
                        key={skill.id}
                        onClick={() => {
                          setSelectedSkills((prev) =>
                            prev.includes(skill.id)
                              ? prev.filter((s) => s !== skill.id)
                              : [...prev, skill.id],
                          );
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/50",
                          isChecked && "bg-brand/5",
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isChecked
                              ? "border-brand bg-brand text-white"
                              : "border-border",
                          )}
                        >
                          {isChecked ? <Check className="size-3" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-foreground text-sm">
                            {skill.name}
                          </span>
                          <span className="text-hint ml-2 text-xs">
                            v{skill.version}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 连接器多选 */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Plug className="text-brand size-4" />
                  <h4 className="text-foreground text-sm font-semibold">
                    选择连接器（{selectedConnectors.length} 已选）
                  </h4>
                </div>
                <div className="max-h-[160px] space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {connectors.map((conn) => {
                    const isChecked = selectedConnectors.includes(conn.id);
                    return (
                      <label
                        key={conn.id}
                        onClick={() => {
                          setSelectedConnectors((prev) =>
                            prev.includes(conn.id)
                              ? prev.filter((c) => c !== conn.id)
                              : [...prev, conn.id],
                          );
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/50",
                          isChecked && "bg-brand/5",
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isChecked
                              ? "border-brand bg-brand text-white"
                              : "border-border",
                          )}
                        >
                          {isChecked ? <Check className="size-3" /> : null}
                        </div>
                        <span className="mr-1 text-base leading-none">
                          {conn.iconEmoji}
                        </span>
                        <span className="text-foreground text-sm">
                          {conn.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* ======== Step 5：确认 ======== */}
          {step === 5 ? (
            <div className="space-y-4">
              {/* 名称输入 */}
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-semibold">
                  智能体名称
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder={
                    selectedTemplate?.name
                      ? `例如：${selectedTemplate.name} v1`
                      : "输入智能体名称"
                  }
                  className="border-border bg-popover text-foreground placeholder:text-hint focus:ring-ring w-full rounded-input border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  autoFocus
                />
              </div>

              {/* Harness 配置只读预览 */}
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Sparkles className="text-brand size-4" />
                  <h4 className="text-foreground text-sm font-semibold">
                    Harness 配置预览
                  </h4>
                </div>
                <div className="border-border bg-card space-y-2 rounded-xl border p-3.5">
                  {[
                    { label: "行业", value: INDUSTRIES.find((i) => i.key === industry)?.name ?? "—" },
                    { label: "岗位", value: selectedTemplate?.name ?? "—" },
                    { label: "绑定技能", value: `${selectedSkills.length} 个` },
                    { label: "绑定连接器", value: `${selectedConnectors.length} 个` },
                    { label: "初始版本", value: "v1.0.0" },
                    { label: "记忆权限", value: "读写" },
                    { label: "来源", value: "自定义" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-hint">{item.label}</span>
                      <span className="text-foreground font-medium">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ======== 底部按钮：上一步 / 下一步 / 创建 ======== */}
        <div className="-mx-4 -mb-4 flex items-center justify-between rounded-b-xl border-t border-border bg-muted/50 px-4 py-3">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              step === 1
                ? "text-hint cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ChevronLeft className="size-4" />
            上一步
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                canNext
                  ? "bg-brand text-white hover:bg-brand/90"
                  : "bg-accent text-hint cursor-not-allowed",
              )}
            >
              下一步
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canNext || creating}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                canNext && !creating
                  ? "bg-brand text-white hover:bg-brand/90"
                  : "bg-accent text-hint cursor-not-allowed",
              )}
            >
              <Sparkles className="size-4" />
              {creating ? "创建中…" : "创建智能体"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
