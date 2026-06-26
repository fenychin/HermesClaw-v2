"use client";

import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Lock, Info } from "lucide-react";
import { toast } from "sonner";

interface QuickActionCustomizerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allAvailable: any[];
  currentOrder: string[];
  onSaveSuccess: () => void;
}

const FIXED_IDS = ["inquiry-grade", "dev-letter", "quote-gen", "agent-dispatch"];

export default function QuickActionCustomizer({
  isOpen,
  onOpenChange,
  allAvailable,
  currentOrder,
  onSaveSuccess,
}: QuickActionCustomizerProps) {
  // 保存选中的卡片ID（按顺序）
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 过滤出当前真实可用的快捷卡片，并排除不可用的
      const availableIds = allAvailable.map((a) => a.id);
      // 先将 currentOrder 里在 available 里的过滤出来
      const initial = currentOrder.filter((id) => availableIds.includes(id));
      // 补充缺失的固定 ID
      const merged = Array.from(new Set([...FIXED_IDS, ...initial])).filter((id) =>
        availableIds.includes(id)
      );
      setSelectedIds(merged);
    }
  }, [isOpen, allAvailable, currentOrder]);

  const handleToggle = (id: string, checked: boolean) => {
    if (FIXED_IDS.includes(id)) return; // 固定卡片不可取消

    if (checked) {
      if (selectedIds.length >= 6) {
        toast.warning("最多只能选择 6 个快捷卡片");
        return;
      }
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    const next = [...selectedIds];
    const [removed] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, removed);
    setSelectedIds(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/brain/quick-actions/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickActionOrder: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("偏好设置保存成功");
        onSaveSuccess();
        onOpenChange(false);
      } else {
        toast.error(data.message || "保存失败");
      }
    } catch (err) {
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // 分类：
  // 1. 已选中的动作 (按 selectedIds 排序)
  const selectedActions = selectedIds
    .map((id) => allAvailable.find((a) => a.id === id))
    .filter(Boolean);

  // 2. 未选中的动作
  const unselectedActions = allAvailable.filter(
    (a) => !selectedIds.includes(a.id)
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full bg-background border-l border-border text-foreground">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="text-lg font-semibold">自定义快捷入口</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground mt-1">
            勾选你常使用的动作或工作流，最多允许选择 6 个卡片。拖拽已选中的卡片可以重新排序。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 已选中排序区域 */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>已展示卡片 ({selectedActions.length}/6)</span>
              <span className="text-[10px] font-normal text-muted-foreground flex items-center gap-1">
                <Info className="size-3" /> 可拖拽排序
              </span>
            </h3>

            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {selectedActions.map((action, index) => {
                  const isFixed = FIXED_IDS.includes(action.id);
                  return (
                    <motion.div
                      layout
                      key={action.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      draggable
                      onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent<Element>, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className="flex items-center gap-3 p-3 bg-muted/40 hover:bg-muted/80 border border-border rounded-lg cursor-move transition-colors group"
                    >
                      <GripVertical className="size-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{action.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {action.description || "外贸专属能力"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isFixed ? (
                          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 bg-muted/80 px-1.5 py-0.5 rounded border border-border">
                            <Lock className="size-2.5" /> 锁定
                          </span>
                        ) : (
                          <Checkbox
                            checked={true}
                            onCheckedChange={(checked) => handleToggle(action.id, !!checked)}
                          />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {selectedActions.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  请在下方勾选要展示的卡片
                </div>
              )}
            </div>
          </div>

          {/* 未选中/备选区域 */}
          {unselectedActions.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-xs font-semibold text-muted-foreground">
                可添加的其它卡片
              </h3>
              <div className="space-y-2">
                {unselectedActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="text-xs font-medium truncate">{action.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {action.description || "外贸专属能力"}
                      </div>
                    </div>
                    <Checkbox
                      checked={false}
                      disabled={selectedIds.length >= 6}
                      onCheckedChange={(checked) => handleToggle(action.id, !!checked)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="p-4 border-t border-border mt-auto flex-row items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存设置"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
