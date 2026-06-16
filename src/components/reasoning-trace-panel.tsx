"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, ShieldAlert, Sparkles, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Make sure to import or define the types locally if they are not exposed to the client
import type { ReasoningTrace, TraceStep, TraceStepStatus } from "@/lib/server/contracts/reasoning-trace";

interface ReasoningTracePanelProps {
  trace: ReasoningTrace;
}

export function ReasoningTracePanel({ trace }: ReasoningTracePanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!trace || !trace.steps || trace.steps.length === 0) {
    return null;
  }

  return (
    <div className="my-4 max-w-2xl text-sm">
      <Card className="overflow-hidden border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span className="font-medium">AI 思考过程</span>
            <span className="text-xs text-slate-400">
              ({trace.steps.length} 步)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {trace.totalDurationMs && (
              <span className="text-xs text-slate-400">
                {(trace.totalDurationMs / 1000).toFixed(1)}s
              </span>
            )}
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-col gap-4">
              {trace.steps.map((step, idx) => (
                <TraceStepItem key={step.id || idx} step={step} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function TraceStepItem({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <StatusIcon status={step.status} />
        </div>
        <div className="flex-1">
          <button
            className="flex items-center justify-between w-full text-left font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            onClick={() => setOpen(!open)}
          >
            <div className="flex items-center gap-2">
              <span>{step.label}</span>
              {step.modelUsed && (
                <span className="text-[10px] rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 dark:bg-indigo-900/50 dark:text-indigo-300">
                  {step.modelUsed}
                </span>
              )}
            </div>
            {step.durationMs && (
              <span className="text-xs text-slate-400 font-normal">
                {step.durationMs}ms
              </span>
            )}
          </button>
          
          {(step.reasoning || step.outputs) && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1 cursor-pointer" onClick={() => setOpen(!open)}>
              {step.reasoning ? step.reasoning : step.outputs ? "查看详细数据" : ""}
            </p>
          )}

          {open && (
            <div className="mt-3 flex flex-col gap-3 rounded-md bg-white p-3 text-xs shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
              {step.reasoning && (
                <div className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                  {step.reasoning}
                </div>
              )}
              
              {step.dataSources && step.dataSources.length > 0 && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">数据来源:</div>
                  <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400">
                    {step.dataSources.map((ds, i) => (
                      <li key={i}>{ds.label}</li>
                    ))}
                  </ul>
                </div>
              )}

              {step.inputs && Object.keys(step.inputs).length > 0 && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Inputs:</div>
                  <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    {JSON.stringify(step.inputs, null, 2)}
                  </pre>
                </div>
              )}

              {step.outputs && Object.keys(step.outputs).length > 0 && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Outputs:</div>
                  <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    {JSON.stringify(step.outputs, null, 2)}
                  </pre>
                </div>
              )}

              {(step.blockedReason || step.fallbackReason) && (
                <div className="text-amber-600 dark:text-amber-500 font-medium">
                  {step.blockedReason || step.fallbackReason}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TraceStepStatus }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "running":
      return <Clock className="h-4 w-4 animate-spin text-blue-500" />;
    case "blocked":
      return <ShieldAlert className="h-4 w-4 text-rose-500" />;
    case "fallback":
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-slate-400" />;
  }
}
