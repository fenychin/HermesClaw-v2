"use client";

import { Sparkles, AlertCircle } from "lucide-react";

/**
 * 工作流上下文确认卡片
 *
 * 当用户从工作台点击工作流卡片跳转到对话页面时，此卡片展示在输入框上方，
 * 告知用户系统已预填上下文信息，等待用户确认或编辑后再发送。
 *
 * 设计原则：绝不自动发送，必须等用户手动提交。
 */
export function WorkflowContextConfirmCard({
  intent,
  workflowRunId,
}: {
  intent: string;
  workflowRunId: string;
}) {
  return (
    <div className="px-4 md:px-8 pt-4 pb-1">
      <div className="max-w-2xl mx-auto">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col gap-3">
          {/* 第一行：标题 + runId 标签 */}
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/20 rounded-lg p-1.5">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-sm font-medium">
                工作流上下文已注入
              </p>
              <p className="text-muted-foreground text-xs mt-0.5 truncate">
                工作流「{intent}」的上下文和系统提示已自动填入输入框。
                你可以编辑下方的提示词，或选中询盘内容后粘贴。
              </p>
            </div>
            <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-mono border border-primary/20 shrink-0">
              {workflowRunId.slice(0, 8)}…
            </span>
          </div>

          {/* 第二行：操作提示 */}
          <div className="flex items-center gap-2 text-[10px] text-hint">
            <AlertCircle className="size-3 shrink-0" />
            <span>点击「发送」按钮或按 Enter 提交后，AI 将开始处理</span>
          </div>
        </div>
      </div>
    </div>
  );
}
