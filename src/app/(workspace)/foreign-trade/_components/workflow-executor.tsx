"use client";

import { useState, useEffect, useRef } from "react";
import { Play, CheckCircle2, Clock, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { useWorkflowExecutionStore } from "@/stores/workflow-execution-store";
import { LetterPreview } from "./letter-preview";
import type {
  Workflow,
  WorkflowStep,
  WorkflowRunStatus,
  WorkflowInput,
} from "@/types/workflow";

// ============================================================
// 运行状态 Badge
// ============================================================

function RunStatusBadge({ status }: { status: WorkflowRunStatus }) {
  const config: Record<
    WorkflowRunStatus,
    { label: string; className: string }
  > = {
    idle: {
      label: "待运行",
      className: "bg-border/40 text-muted-foreground",
    },
    running: {
      label: "运行中",
      className: "bg-primary/15 text-primary",
    },
    completed: {
      label: "已完成",
      className: "bg-success/15 text-success",
    },
    failed: {
      label: "执行失败",
      className: "bg-danger/15 text-danger",
    },
  };

  const { label, className } = config[status];
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", className)}>
      {label}
    </span>
  );
}

// ============================================================
// 加载动画（三个跳动圆点）
// ============================================================

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <span className="text-hint text-xs ml-1">正在执行...</span>
    </div>
  );
}

// ============================================================
// 单个步骤输入控件
// ============================================================

interface InputFieldProps {
  input: WorkflowInput;
  value: string;
  onChange: (key: string, value: string) => void;
}

function InputField({ input, value, onChange }: InputFieldProps) {
  const baseClass = cn(
    "w-full bg-background border border-border rounded-xl px-3 py-2",
    "text-foreground text-sm placeholder:text-hint",
    "focus:outline-none focus:border-primary/60 transition-colors",
  );

  if (input.type === "textarea") {
    return (
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {input.label}
          {input.required && <span className="text-danger ml-0.5">*</span>}
        </label>
        <textarea
          rows={4}
          placeholder={input.placeholder}
          value={value}
          onChange={(e) => onChange(input.key, e.target.value)}
          className={cn(baseClass, "resize-none")}
        />
      </div>
    );
  }

  if (input.type === "select") {
    return (
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {input.label}
          {input.required && <span className="text-danger ml-0.5">*</span>}
        </label>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(input.key, e.target.value)}
            className={cn(baseClass, "appearance-none cursor-pointer pr-8")}
          >
            <option value="">请选择...</option>
            {input.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-hint pointer-events-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-xs font-medium">
        {input.label}
        {input.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        type="text"
        placeholder={input.placeholder}
        value={value}
        onChange={(e) => onChange(input.key, e.target.value)}
        className={baseClass}
      />
    </div>
  );
}

// ============================================================
// 定制化已完成步骤卡片：AI 分析结果 (Inquiry Grade)
// ============================================================

function AiAnalysisCompletedCard({ step }: { step: WorkflowStep }) {
  const gradeOut = step.outputs?.find(o => o.key === 'grade')?.value || 'A';
  const scoreOut = step.outputs?.find(o => o.key === 'score')?.value || '87';
  const analysisOut = step.outputs?.find(o => o.key === 'analysis')?.value || '';
  const suggestedActionOut = step.outputs?.find(o => o.key === 'suggested_action')?.value || '';

  let gradeClass = "bg-card border-border text-muted-foreground"; // C级或默认
  if (gradeOut.includes('A')) gradeClass = "bg-success/10 border-success/30 text-success";
  else if (gradeOut.includes('B')) gradeClass = "bg-warning/10 border-warning/30 text-warning";

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success shrink-0" />
          <span className="text-foreground text-sm font-medium">{step.title}</span>
        </div>
        {step.durationSec !== undefined && (
          <span className="flex items-center gap-1 text-hint text-xs">
            <Clock className="size-3" />
            {step.durationSec}s
          </span>
        )}
      </div>

      <div className="flex gap-3 mb-4">
        <div className={cn("px-3 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-1.5", gradeClass)}>
          <span className="text-xs uppercase tracking-wider opacity-80">等级</span>
          {gradeOut}级
        </div>
        <div className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-semibold flex items-center gap-1.5 text-foreground">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">评分</span>
          {scoreOut}/100
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-hint text-[10px] font-semibold uppercase tracking-wider mb-1.5">分析摘要</p>
          <div className="bg-background rounded-xl p-4 leading-relaxed text-foreground text-sm border border-border/50">
            <MarkdownRenderer content={analysisOut} />
          </div>
        </div>
        <div>
          <p className="text-hint text-[10px] font-semibold uppercase tracking-wider mb-1.5">建议动作</p>
          <p className="text-sm text-brand-blue font-medium">{suggestedActionOut}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 定制化已完成步骤卡片：分配动作 (Inquiry Grade)
// ============================================================

function AssignActionCompletedCard() {
  return (
    <div className="bg-card rounded-2xl border border-success/30 p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="size-4 text-success shrink-0" />
        <span className="text-foreground text-sm font-medium">任务已创建</span>
      </div>
      <p className="text-muted-foreground text-xs ml-6">已按照您的选择分配跟进任务，系统已自动创建后续跟进计划。</p>
    </div>
  );
}

// ============================================================
// 通用已完成步骤卡片
// ============================================================

interface StepCardProps {
  step: WorkflowStep;
}

function CompletedStepCard({ step }: StepCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success shrink-0" />
          <span className="text-foreground text-sm font-medium">{step.title}</span>
        </div>
        {step.durationSec !== undefined && (
          <span className="flex items-center gap-1 text-hint text-xs">
            <Clock className="size-3" />
            {step.durationSec}s
          </span>
        )}
      </div>

      {step.inputs && step.inputs.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-hint text-[10px] font-semibold uppercase tracking-wider">
            输入参数
          </p>
          {step.inputs.map((inp) => (
            <div key={inp.key} className="flex items-start gap-2">
              <span className="text-muted-foreground text-xs shrink-0 pt-0.5 min-w-[64px]">
                {inp.label}
              </span>
              <span className="text-muted-foreground text-xs">—</span>
              <span className="text-foreground text-xs">{inp.value || inp.placeholder || "（已填写）"}</span>
            </div>
          ))}
        </div>
      )}

      {step.outputs && step.outputs.length > 0 && (
        <div className="space-y-2">
          {step.outputs
            .filter((out) => out.value)
            .map((out) => (
              <div key={out.key}>
                <p className="text-hint text-[10px] font-semibold uppercase tracking-wider mb-2">
                  {out.label}
                </p>
                <div className="bg-background rounded-xl p-3 text-muted-foreground">
                  {out.type === "markdown" && out.value ? (
                    <MarkdownRenderer content={out.value} />
                  ) : (
                    <p className="text-sm">{out.value}</p>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 卡片渲染分发
// ============================================================
function getCompletedStepCard(step: WorkflowStep) {
  if (step.id === 'ai-analysis') return <AiAnalysisCompletedCard key={step.id} step={step} />;
  if (step.id === 'assign-action') return <AssignActionCompletedCard key={step.id} />;
  if (step.id === 'review-edit') return null; // review-edit 步骤完成时，不显示通用已完成卡片
  return <CompletedStepCard key={step.id} step={step} />;
}

// ============================================================
// 执行中步骤卡片
// ============================================================

function RunningStepCard({ step }: StepCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-primary/30 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
        <span className="text-foreground text-sm font-medium">{step.title}</span>
      </div>
      <ThinkingDots />
    </div>
  );
}

// ============================================================
// 底部用户输入区
// ============================================================

interface BottomInputZoneProps {
  step: WorkflowStep;
  onConfirm: (values: Record<string, string>) => void;
}

function BottomInputZone({ step, onConfirm }: BottomInputZoneProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  if (!step.inputs || step.inputs.length === 0) return null;

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    onConfirm(values);
  };

  return (
    <div className="shrink-0 border-t border-border bg-card/50 p-4">
      <p className="text-muted-foreground text-xs font-medium mb-3">
        当前步骤需要您填写以下信息：
      </p>
      <div className="space-y-3 mb-4">
        {step.inputs.map((inp) => (
          <InputField
            key={inp.key}
            input={inp}
            value={values[inp.key] ?? ""}
            onChange={handleChange}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={handleConfirm}
        className={cn(
          "w-full bg-primary text-white rounded-xl py-2 text-sm font-medium",
          "hover:bg-primary/90 transition-colors active:scale-[0.99]",
        )}
      >
        确认执行
      </button>
    </div>
  );
}

// ============================================================
// WorkflowExecutor 主组件
// ============================================================

interface WorkflowExecutorProps {
  workflow: Workflow;
  runStatus: WorkflowRunStatus;
  onRun: () => void;
}

export function WorkflowExecutor({
  workflow,
  runStatus,
  onRun,
}: WorkflowExecutorProps) {
  const { submitStepInput, completeStep, advanceToNextStep, goToStep } = useWorkflowExecutionStore();

  const runningStep = workflow.steps.find((s) => s.status === "running");
  
  const generateLetterStep = workflow.steps.find((s) => s.id === "generate-letter");
  
  // LetterPreview 状态
  const [reviewBody, setReviewBody] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const initializedRef = useRef(false);

  // 初始化 reviewBody
  useEffect(() => {
    if (runningStep?.id === "review-edit" && !isRegenerating && !initializedRef.current) {
      const bodyOut = generateLetterStep?.outputs?.find(o => o.key === "body")?.value || "";
      setReviewBody(bodyOut);
      initializedRef.current = true;
    }
  }, [runningStep?.id, generateLetterStep?.outputs, isRegenerating]);

  // 处理底部表单确认提交
  const handleStepConfirm = (values: Record<string, string>) => {
    if (!runningStep) return;
    const runningIdx = workflow.steps.findIndex((s) => s.id === runningStep.id);
    if (runningIdx !== -1) {
      submitStepInput(runningIdx, values);
      completeStep(runningIdx, {}, 0.5); // 标记完成并记录 0.5s 耗时
      advanceToNextStep();
    }
  };

  const handleReviewConfirm = () => {
    if (runningStep?.id === "review-edit") {
      const runningIdx = workflow.steps.findIndex((s) => s.id === "review-edit");
      submitStepInput(runningIdx, { edited_body: reviewBody });
      completeStep(runningIdx, {}, 0.5);
      advanceToNextStep();
    }
  };

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setReviewBody("");
    initializedRef.current = false;
    const genIdx = workflow.steps.findIndex((s) => s.id === "generate-letter");
    if (genIdx !== -1) {
      goToStep(genIdx);
    }
  };

  // 监听无输入步骤的自动执行
  useEffect(() => {
    if (!runningStep) return;
    const runningIdx = workflow.steps.findIndex((s) => s.id === runningStep.id);
    
    // inquiry-grade: AI 分析
    if (runningStep.id === 'ai-analysis') {
      const timer = setTimeout(() => {
        completeStep(runningIdx, {
          grade: 'A',
          score: '87',
          analysis: '客户明确说明产品规格需求，询盘数量具体（500pcs），有明确时间线（2周内），判断为高意向买家...',
          suggested_action: '24小时内发送报价单并安排样品'
        }, 1.5);
        advanceToNextStep();
      }, 1500);
      return () => clearTimeout(timer);
    }
    
    // dev-letter: AI 生成开发信
    if (runningStep.id === 'generate-letter') {
      const timer = setTimeout(() => {
        setIsRegenerating(false);
        const subject = "Premium Outdoor Folding Chairs – Certified & Ready for Q3 2025";
        const body = `Dear Sarah,\n\nI hope this message finds you well. My name is [Your Name], and I'm reaching out from [Company Name], a leading manufacturer of outdoor folding furniture based in [City], China.\n\nHaving followed Outdoor World LLC's impressive growth in the North American market, I believe our **Aluminum Folding Chair Pro Series** could be an excellent fit for your Q3 lineup:\n\n- ✅ **ASTM F1561 & CA Prop 65 Certified** — Fully compliant for California retail\n- ✅ **10,000+ pcs capacity** — Stable production with 45-day FOB lead time\n- ✅ **Proven partnerships** — Currently serving 3 top-10 US outdoor retailers\n\nI'd love to send over our latest catalog and a **custom sample** for your evaluation.\n\nWould you have 15 minutes for a brief call this week?\n\nBest regards,\n[Your Name]\n[Title] | [Company] | [Contact]`;
        setReviewBody(body);

        completeStep(runningIdx, {
          subject,
          body
        }, 3.5);
        advanceToNextStep();
      }, 3500);
      return () => clearTimeout(timer);
    }

    // 其他无输入步骤
    if (!runningStep.inputs || runningStep.inputs.length === 0) {
      const timer = setTimeout(() => {
        completeStep(runningIdx, {}, 1.0);
        advanceToNextStep();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [runningStep, workflow.steps, completeStep, advanceToNextStep]);

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* ---- 顶部工具栏 ---- */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-foreground text-sm font-semibold truncate">
            {workflow.title}
          </h1>
          <RunStatusBadge status={runStatus} />
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={runStatus === "running" || runStatus === "completed"}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium",
            "bg-primary text-white transition-all",
            runStatus === "running" || runStatus === "completed"
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-primary/90 active:scale-[0.97]",
          )}
        >
          <Play className="size-3 fill-white" />
          {runStatus === "running" ? "执行中..." : runStatus === "completed" ? "已完成" : "执行"}
        </button>
      </div>

      {/* ---- 主内容区：步骤卡片列表 ---- */}
      <div className="flex-1 overflow-y-auto p-5">
        {runStatus === "idle" && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="bg-primary/10 rounded-2xl p-4 mb-4">
              <Play className="size-8 text-primary fill-primary/30" />
            </div>
            <p className="text-foreground text-sm font-medium">点击「执行」开始运行</p>
            <p className="text-hint text-xs mt-1 max-w-[260px] leading-relaxed">
              工作流将逐步自动执行，部分步骤需要您提供输入
            </p>
          </div>
        )}

        {runStatus !== "idle" && (
          <>
            {workflow.steps
              .filter((s) => s.status === "completed" || s.status === "failed")
              .map((step) => {
                if (step.status === "failed") {
                  return (
                    <div
                      key={step.id}
                      className="bg-card rounded-2xl border border-danger/30 p-4 mb-3"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 text-danger shrink-0" />
                        <span className="text-foreground text-sm font-medium">
                          {step.title}
                        </span>
                        <span className="text-danger text-xs ml-auto">执行失败</span>
                      </div>
                    </div>
                  );
                }
                return getCompletedStepCard(step);
              })}

            {runningStep && <RunningStepCard step={runningStep} />}
            
            {/* 成功状态/开发信完成预览 */}
            {runStatus === "completed" && workflow.id === "dev-letter" && (
              <LetterPreview
                subject={generateLetterStep?.outputs?.find(o => o.key === "subject")?.value || ""}
                body={reviewBody}
                isCompleted={true}
              />
            )}
          </>
        )}
      </div>

      {/* ---- 底部用户输入区 ---- */}
      {/* 针对 review-edit 使用特殊的 LetterPreview */}
      {runningStep?.id === "review-edit" && (
        <div className="shrink-0 border-t border-border bg-card/50 p-4">
          <LetterPreview
            subject={generateLetterStep?.outputs?.find(o => o.key === "subject")?.value || ""}
            body={reviewBody}
            onChangeBody={setReviewBody}
            onConfirm={handleReviewConfirm}
            onRegenerate={handleRegenerate}
          />
        </div>
      )}

      {/* 通用步骤输入 */}
      {runningStep && runningStep.inputs && runningStep.inputs.length > 0 && runningStep.id !== "review-edit" && (
        <BottomInputZone
          step={runningStep}
          onConfirm={handleStepConfirm}
        />
      )}
    </div>
  );
}
