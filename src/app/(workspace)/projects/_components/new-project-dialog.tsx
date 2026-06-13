"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (project: {
    name: string;
    description: string;
    industry: "foreign-trade" | "other";
  }) => void;
}

/**
 * 新建项目空间 Dialog 组件
 * 使用 shadcn Dialog 组件，包含名称、描述、行业选择
 */
export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState<"foreign-trade" | "other">("foreign-trade");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("项目名称不能为空");
      return;
    }
    setError("");
    onCreate({
      name: name.trim(),
      description: description.trim(),
      industry,
    });
    // 重置表单
    setName("");
    setDescription("");
    setIndustry("foreign-trade");
    onOpenChange(false);
  };

  const handleCancel = () => {
    setName("");
    setDescription("");
    setIndustry("foreign-trade");
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] sm:max-w-[480px] rounded-2xl border border-border bg-popover p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-foreground text-lg font-semibold">
            新建项目空间
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs mt-1">
            创建一个独立的协作空间，包含独立的中期记忆、智能体分配和文档管理。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 项目名称 */}
          <div className="space-y-1.5">
            <label className="text-foreground text-sm font-medium">
              项目名称 <span className="text-danger">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setError("");
              }}
              placeholder="请输入项目空间名称，例如：BrightPath 户外灯具出口"
              className={error ? "border-danger focus-visible:ring-danger/20" : ""}
            />
            {error && <p className="text-danger text-xs mt-1">{error}</p>}
          </div>

          {/* 行业选择 */}
          <div className="space-y-1.5">
            <label className="text-foreground text-sm font-medium">
              所属行业
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as "foreign-trade" | "other")}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary cursor-pointer w-full h-[38px] transition-all"
            >
              <option value="foreign-trade">外贸</option>
              <option value="other">其他</option>
            </select>
          </div>

          {/* 项目描述 */}
          <div className="space-y-1.5">
            <label className="text-foreground text-sm font-medium">
              项目描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请描述该项目空间的目标、关联客户或具体交付要求（可选）"
              rows={3}
              className="flex min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-hint focus-visible:outline-none focus-visible:border-primary transition-all resize-none"
            />
          </div>

          {/* 底部按钮 */}
          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="rounded-xl"
            >
              取消
            </Button>
            <Button type="submit" className="bg-primary text-white rounded-xl">
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
