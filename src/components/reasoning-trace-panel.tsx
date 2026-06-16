'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, PauseCircle, Loader2, CircleDashed } from 'lucide-react'

export interface ReasoningTracePanelProps {
  traceId: string
  defaultOpen?: boolean
}

// 简化的接口定义，用于组件内部渲染
interface TraceStep {
  id: string
  type: string
  status: 'running' | 'passed' | 'completed' | 'blocked' | 'fallback' | 'error' | 'pending'
  label: string
  reasoning?: string
  modelUsed?: string
  durationMs?: number
}

interface ReasoningTrace {
  traceId: string
  steps: TraceStep[]
}

function StatusIcon({ status }: { status: TraceStep['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    case 'passed':
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />
    case 'blocked':
    case 'fallback':
      return <PauseCircle className="h-4 w-4 text-amber-500" />
    case 'pending':
    default:
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />
  }
}

export function ReasoningTracePanel({ traceId, defaultOpen = false }: ReasoningTracePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [trace, setTrace] = useState<ReasoningTrace | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && !trace && !loading && !error) {
      let isMounted = true
      setLoading(true)
      
      fetch(`/api/reasoning-traces/${traceId}`)
        .then(res => res.json())
        .then(data => {
          if (!isMounted) return
          if (data.success) {
            setTrace(data.data)
          } else {
            setError(data.error || 'Failed to load trace')
          }
        })
        .catch(err => {
          if (isMounted) setError(err.message)
        })
        .finally(() => {
          if (isMounted) setLoading(false)
        })
        
      return () => { isMounted = false }
    }
  }, [isOpen, traceId, trace, loading, error])

  return (
    <div className="border border-border rounded-md bg-background text-sm text-foreground overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full px-3 py-2 text-left font-medium text-muted-foreground hover:bg-muted/50 focus:outline-none transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
        查看 AI 推理过程
      </button>

      {isOpen && (
        <div className="p-3 border-t border-border bg-muted/20">
          {loading && (
            <div className="space-y-3">
              <div className="h-3 bg-muted rounded animate-pulse w-3/4"></div>
              <div className="h-3 bg-muted rounded animate-pulse w-1/2"></div>
              <div className="h-3 bg-muted rounded animate-pulse w-5/6"></div>
            </div>
          )}
          
          {error && <div className="text-destructive text-xs">加载失败：{error}</div>}

          {trace && trace.steps && (
            <div className="space-y-4">
              {trace.steps.map((step) => (
                <div key={step.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={step.status} />
                    <span className="font-medium">{step.label}</span>
                    {step.durationMs !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {(step.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  
                  {(step.reasoning || step.modelUsed) && (
                    <div className="ml-6 pl-3 border-l-2 border-border flex flex-col gap-2 mt-0.5">
                      {step.reasoning && (
                        <p className="text-muted-foreground leading-relaxed text-xs">
                          {step.reasoning}
                        </p>
                      )}
                      {step.modelUsed && (
                        <div className="inline-flex">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium tracking-wider">
                            {step.modelUsed}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {trace.steps.length === 0 && (
                <div className="text-muted-foreground italic text-xs">暂无推理步骤记录。</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
