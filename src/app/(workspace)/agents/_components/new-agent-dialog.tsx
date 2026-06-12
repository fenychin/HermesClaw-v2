"use client";

import { useState, useCallback } from "react";
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
    key: "document",
    name: "产品资料员",
    desc: "知识库检索、多语言翻译、规格整理",
    icon: FileText,
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
                        update("role", tmpl.key === "sales" ? "客户开发与跟进" : tmpl.key === "inquiry" ? "自动分类与评级" : tmpl.key === "document" ? "整理商品详情与规格" : "客户背景与合规风险排查");
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
        return (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-sm font-medium text-foreground">
              角色与描述
            </h3>
            <p className="text-xs text-muted-foreground -mt-2">
              定义智能体的身份与工作意图，系统将据此匹配技能与连接器
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">
                名称 <span className="text-danger">*</span>
              </label>
              <Input
                placeholder="例如：高级邮件助理"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={50}
                className="h-9 text-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">
                角色 <span className="text-danger">*</span>
              </label>
              <Input
                placeholder="例如：客户开发与跟进"
                value={form.role}
                onChange={(e) => update("role", e.target.value)}
                maxLength={100}
                className="h-9 text-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">
                描述 / 意图
              </label>
              <textarea
                placeholder="描述该智能体的主要职责与工作意图，越详细越有助于系统精确理解..."
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-hint focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <span className="text-[10px] text-hint self-end">
                {form.description.length}/500
              </span>
            </div>
          </div>
        );

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
                        onClick={() => update("automationLevel", level)}
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
