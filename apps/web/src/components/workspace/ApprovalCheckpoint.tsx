"use client";

import type { HumanApprovalCheckpoint } from "@hermesclaw/event-contracts";
import { Shield, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ApprovalCheckpointProps {
  checkpoint: HumanApprovalCheckpoint;
}

/** HumanApprovalCheckpoint 审批卡片
 *  当 ExecutionEvent.eventType === 'approval.requested' 时渲染
 *  用户点击「批准」或「拒绝」后调用后端 API，
 *  前端不做本地放行判断，完全等待服务端通过 WS 推送新状态来驱动 UI。
 */
export function ApprovalCheckpoint({ checkpoint }: ApprovalCheckpointProps) {
  
  async function handleApprove() {
    try {
      const res = await fetch(`/api/approvals/${checkpoint.checkpointId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      if (!res.ok) throw new Error("Approval request failed");
    } catch (err) {
      console.error("Failed to approve checkpoint:", err);
    }
  }

  async function handleReject() {
    try {
      const res = await fetch(`/api/approvals/${checkpoint.checkpointId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject" }),
      });
      if (!res.ok) throw new Error("Rejection request failed");
    } catch (err) {
      console.error("Failed to reject checkpoint:", err);
    }
  }

  return (
    <div className="backdrop-blur-md bg-card/65 border border-amber-500/20 rounded-2xl p-5 shadow-lg relative overflow-hidden transition-all duration-200 hover:border-amber-500/30">
      {/* 背景光晕装饰 */}
      <div className="absolute -right-10 -top-10 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
      
      <div className="flex items-start gap-4">
        {/* 琥珀色警告盾牌 */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 shrink-0">
          <Shield className="size-5" />
        </div>

        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <AlertTriangle className="size-3" />
              需要审批 checkpoint
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {checkpoint.checkpointId}
            </span>
          </div>

          <p className="text-foreground text-xs leading-relaxed font-medium">
            {checkpoint.actionSummary}
          </p>

          <p className="text-muted-foreground text-[10px] flex items-center gap-1">
            <span>风险等级: </span>
            <strong className="text-amber-500 font-semibold">{checkpoint.riskLevel}</strong>
            <span className="text-muted-foreground/60">(由 Hermes 后端判定策略等级)</span>
          </p>
        </div>
      </div>

      {/* 按钮操作区 */}
      <div className="mt-5 border-t border-border/40 pt-4 flex gap-3 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReject}
          className="border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 text-red-400 h-9 rounded-xl px-4 text-xs font-semibold flex items-center gap-1"
        >
          <X className="size-3.5" />
          <span>拒绝</span>
        </Button>
        <Button
          size="sm"
          onClick={handleApprove}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white h-9 rounded-xl px-4 text-xs font-semibold border border-emerald-500/30 flex items-center gap-1 shadow-sm"
        >
          <Check className="size-3.5" />
          <span>批准</span>
        </Button>
      </div>
    </div>
  );
}
