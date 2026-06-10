"use client";

import { useState } from "react";
import {
  Sparkles,
  Send,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// 类型定义
// ============================================================

interface InquiryFormData {
  fromEmail: string;
  subject: string;
  content: string;
  countryCode: string;
}

interface SubmitState {
  status: "idle" | "submitting" | "success" | "error";
  data?: {
    id: string;
    priority: string;
    workflowRunId?: string;
    workflowStatus?: string;
    workflowOutput?: unknown;
  };
  error?: string;
}

// ============================================================
// 国家选项
// ============================================================

const COUNTRY_OPTIONS = [
  { label: "美国", value: "US" },
  { label: "德国", value: "DE" },
  { label: "英国", value: "GB" },
  { label: "法国", value: "FR" },
  { label: "澳大利亚", value: "AU" },
  { label: "加拿大", value: "CA" },
  { label: "日本", value: "JP" },
  { label: "韩国", value: "KR" },
  { label: "印度", value: "IN" },
  { label: "巴西", value: "BR" },
  { label: "阿联酋", value: "AE" },
  { label: "其他", value: "OTHER" },
];

// ============================================================
// 组件
// ============================================================

export function InquiryQuickEntry() {
  const [form, setForm] = useState<InquiryFormData>({
    fromEmail: "",
    subject: "",
    content: "",
    countryCode: "US",
  });
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const [isExpanded, setIsExpanded] = useState(false);

  const updateField = (field: keyof InquiryFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isFormValid =
    form.fromEmail.trim().length > 0 &&
    form.fromEmail.includes("@") &&
    form.subject.trim().length > 0 &&
    form.content.trim().length > 10;

  const handleSubmit = async () => {
    if (!isFormValid || submit.status === "submitting") return;

    setSubmit({ status: "submitting" });

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: form.fromEmail.trim(),
          subject: form.subject.trim(),
          content: form.content.trim(),
          countryCode: form.countryCode,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "提交失败");
      }

      setSubmit({
        status: "success",
        data: json.data,
      });
    } catch (err) {
      setSubmit({
        status: "error",
        error: err instanceof Error ? err.message : "网络错误，请重试",
      });
    }
  };

  const handleReset = () => {
    setForm({ fromEmail: "", subject: "", content: "", countryCode: "US" });
    setSubmit({ status: "idle" });
    setIsExpanded(false);
  };

  // ============================================================
  // Render: 收起态（快速入口卡片）
  // ============================================================
  const collapsedView = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsExpanded(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setIsExpanded(true);
      }}
      className={cn(
        "bg-card rounded-2xl border border-primary/20 p-4",
        "hover:border-primary/40 hover:shadow-sm",
        "cursor-pointer transition-all duration-200",
        "group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 rounded-xl p-2">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">
              询盘智能处理
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              粘贴邮件 · AI 自动分级 · A 级自动生成开发信
            </p>
          </div>
        </div>
        <div className="bg-primary/10 rounded-lg px-2.5 py-1 text-primary text-xs font-medium group-hover:bg-primary/20 transition-colors">
          立即使用
        </div>
      </div>
    </div>
  );

  // ============================================================
  // Render: 展开态（表单）
  // ============================================================
  const expandedView = (
    <div className="bg-card rounded-2xl border border-primary/30 p-5">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/20 rounded-lg p-1.5">
            <Sparkles className="size-4 text-primary" />
          </div>
          <h3 className="text-foreground text-sm font-semibold">询盘智能处理</h3>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="text-hint hover:text-muted-foreground text-xs transition-colors"
        >
          收起
        </button>
      </div>

      {/* 成功态 */}
      {submit.status === "success" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-success/10 rounded-xl p-3">
            <CheckCircle2 className="size-4 text-success shrink-0" />
            <div>
              <p className="text-success text-sm font-medium">
                询盘已创建，AI 分级工作流已启动
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                优先级：{submit.data?.priority === "high" ? "🔥 高" : submit.data?.priority === "mid" ? "📌 中" : "📋 低"}
                {submit.data?.workflowRunId && (
                  <> · 运行 ID：{submit.data.workflowRunId.slice(0, 8)}...</>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              "w-full rounded-xl py-2 text-xs font-medium",
              "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
            )}
          >
            处理新询盘
          </button>
        </div>
      )}

      {/* 错误态 */}
      {submit.status === "error" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-danger/10 rounded-xl p-3">
            <AlertCircle className="size-4 text-danger shrink-0" />
            <div>
              <p className="text-danger text-sm font-medium">提交失败</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {submit.error}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              "w-full rounded-xl py-2 text-xs font-medium",
              "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
            )}
          >
            重试
          </button>
        </div>
      )}

      {/* 表单态（idle / submitting） */}
      {submit.status !== "success" && submit.status !== "error" && (
        <div className="space-y-3">
          {/* 第一行：邮箱 + 国家 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-hint text-[11px] font-medium uppercase tracking-wider">
                客户邮箱 <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                placeholder="buyer@example.com"
                value={form.fromEmail}
                onChange={(e) => updateField("fromEmail", e.target.value)}
                disabled={submit.status === "submitting"}
                className={cn(
                  "w-full bg-background border border-border rounded-lg px-3 py-2",
                  "text-foreground text-sm placeholder:text-hint",
                  "focus:outline-none focus:border-primary/60 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-hint text-[11px] font-medium uppercase tracking-wider">
                国家
              </label>
              <div className="relative">
                <select
                  value={form.countryCode}
                  onChange={(e) => updateField("countryCode", e.target.value)}
                  disabled={submit.status === "submitting"}
                  className={cn(
                    "w-full bg-background border border-border rounded-lg px-3 py-2 appearance-none cursor-pointer",
                    "text-foreground text-sm",
                    "focus:outline-none focus:border-primary/60 transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {COUNTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-hint pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 主题 */}
          <div className="space-y-1">
            <label className="text-hint text-[11px] font-medium uppercase tracking-wider">
              邮件主题 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              placeholder="Inquiry about Outdoor Folding Chairs — Q3 2025"
              value={form.subject}
              onChange={(e) => updateField("subject", e.target.value)}
              disabled={submit.status === "submitting"}
              className={cn(
                "w-full bg-background border border-border rounded-lg px-3 py-2",
                "text-foreground text-sm placeholder:text-hint",
                "focus:outline-none focus:border-primary/60 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {/* 正文 */}
          <div className="space-y-1">
            <label className="text-hint text-[11px] font-medium uppercase tracking-wider">
              询盘内容 <span className="text-danger">*</span>
            </label>
            <textarea
              rows={5}
              placeholder="粘贴客户询盘邮件正文（至少 10 个字符）..."
              value={form.content}
              onChange={(e) => updateField("content", e.target.value)}
              disabled={submit.status === "submitting"}
              className={cn(
                "w-full bg-background border border-border rounded-lg px-3 py-2 resize-none",
                "text-foreground text-sm placeholder:text-hint leading-relaxed",
                "focus:outline-none focus:border-primary/60 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {/* 提交按钮 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || submit.status === "submitting"}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all",
              isFormValid
                ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.99]"
                : "bg-border/40 text-hint cursor-not-allowed",
            )}
          >
            {submit.status === "submitting" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                AI 分析中...
              </>
            ) : (
              <>
                <Send className="size-4" />
                提交分析
              </>
            )}
          </button>

          {/* 提示 */}
          <p className="text-hint text-[11px] text-center">
            提交后将自动执行 AI 询盘分级 · A 级客户自动生成开发信草稿
          </p>
        </div>
      )}
    </div>
  );

  return (
    <section>
      <p className="text-foreground font-medium mb-3 text-sm">快速入口</p>
      {isExpanded ? expandedView : collapsedView}
    </section>
  );
}
