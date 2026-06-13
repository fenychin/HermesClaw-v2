"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ClipboardList } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useCreateTask, type TaskPriority } from "@/hooks/use-tasks"
import { useCurrentWorkspaceRole } from "@/hooks/use-workspace-role"
import { cn } from "@/lib/utils"
import type { MarketIntelligence, ImpactLevel } from "@/types/trade"

// ==============================
// 工具函数
// ==============================

/** impactLevel → TaskPriority 映射 */
function impactToPriority(impact: ImpactLevel): TaskPriority {
  switch (impact) {
    case "high":
      return "URGENT"
    case "mid":
      return "HIGH"
    default:
      return "MEDIUM"
  }
}

/** 影响力色标 */
function impactBadgeClass(impact: ImpactLevel): string {
  switch (impact) {
    case "high":
      return "bg-danger/10 text-danger border-danger/20"
    case "mid":
      return "bg-warning/10 text-warning border-warning/20"
    default:
      return "bg-success/10 text-success border-success/20"
  }
}

// ==============================
// 组件
// ==============================

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  intelligence: MarketIntelligence
}

/**
 * 从情报卡片"分发为任务"的对话框
 * —— 预填标题（suggestedAction 或 title）、优先级（impactLevel 映射）
 * —— 写操作需 MEMBER 以上角色，VIEWER 时禁用按钮并显示 tooltip
 * —— 提交后调用 POST /api/tasks，成功时 toast 通知并刷新任务缓存
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  intelligence,
}: CreateTaskDialogProps) {
  const { isViewer } = useCurrentWorkspaceRole()
  const createTask = useCreateTask()

  // 表单状态（随 intelligence 变化重建，由 Dialog key 控制）
  const [title, setTitle] = useState(
    intelligence.suggestedAction || intelligence.title,
  )
  const [dueAt, setDueAt] = useState("")

  const priority = impactToPriority(intelligence.impactLevel)

  const handleSubmit = () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    createTask.mutate(
      {
        title: trimmedTitle,
        description: intelligence.summary ?? undefined,
        priority,
        source: "intelligence",
        relatedType: "MarketIntelligence",
        relatedId: intelligence.id,
        dueAt: dueAt || undefined,
      },
      {
        onSuccess: () => {
          toast.success("任务创建成功", {
            description: `已将"${trimmedTitle}"添加至待办任务`,
          })
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error("任务创建失败", {
            description:
              error instanceof Error ? error.message : "未知错误",
          })
        },
      },
    )
  }

  const submitButton = (
    <Button
      onClick={handleSubmit}
      disabled={!title.trim() || createTask.isPending || isViewer}
    >
      {createTask.isPending ? "创建中..." : "创建任务"}
    </Button>
  )

  return (
    <Dialog key={intelligence.id} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            分发为任务
          </DialogTitle>
          <DialogDescription>
            基于情报「{intelligence.title}」创建待办任务，写入 AuditLog（L2 /
            low）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 标题 */}
          <div className="space-y-1.5">
            <label
              htmlFor="task-title"
              className="text-foreground text-sm font-medium"
            >
              任务标题
            </label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入任务标题..."
            />
          </div>

          {/* 优先级（只读展示，由 impactLevel 推导） */}
          <div className="space-y-1.5">
            <span className="text-foreground text-sm font-medium">
              优先级
            </span>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium border",
                  impactBadgeClass(intelligence.impactLevel),
                )}
              >
                {priority}
              </span>
              <span className="text-hint text-xs">
                （由影响力级别自动推导）
              </span>
            </div>
          </div>

          {/* 截止日期（可选） */}
          <div className="space-y-1.5">
            <label
              htmlFor="task-due"
              className="text-foreground text-sm font-medium"
            >
              截止日期
              <span className="text-hint text-xs ml-1 font-normal">
                （可选）
              </span>
            </label>
            <Input
              id="task-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {isViewer ? (
            <Tooltip>
              <TooltipTrigger>{submitButton}</TooltipTrigger>
              <TooltipContent>需要成员权限</TooltipContent>
            </Tooltip>
          ) : (
            submitButton
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
