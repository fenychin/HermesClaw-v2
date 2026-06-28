"use client"

import { Component, type ReactNode } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

interface PanelErrorBoundaryProps {
  children: ReactNode
  /** 面板标题（用于降级卡片展示） */
  title: string
  /** 手动重试回调（可选） */
  onRetry?: () => void
}

interface PanelErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

/**
 * 面板级轻量错误边界。
 *
 * 每个右侧面板包裹一个独立 ErrorBoundary，
 * 确保一个面板渲染异常不会导致整页 crash。
 * 降级卡片展示错误信息 + 重试按钮。
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorMessage: "" }
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error) {
    console.error(`[PanelErrorBoundary] ${this.props.title} 渲染异常:`, error)
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-destructive/20 bg-destructive/5 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="font-medium">{this.props.title} 加载异常</span>
          </div>
          <p className="text-hint text-[11px] leading-relaxed line-clamp-2">
            {this.state.errorMessage || "未知渲染错误"}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 text-brand text-[11px] hover:underline"
          >
            <RefreshCw className="size-3" />
            点击重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
