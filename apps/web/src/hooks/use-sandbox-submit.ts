/**
 * useSandboxSubmit — 沙盘推演提交与结果轮询 Hook
 *
 * 流程：submit → 获取 taskId → 轮询 scenario-results/:id → 返回 ScenarioResult
 */
"use client"

import { useState, useCallback, useRef } from "react"
import { submitSandbox, fetchScenarioResult } from "@/services/api/industry-intel-api"
import type { SandboxSubmitInput, ScenarioResult } from "@/types/industry-intel"

interface UseSandboxSubmitReturn {
  /** 是否正在推演中 */
  isRunning: boolean
  /** 推演结果（null 表示未完成或未开始） */
  result: ScenarioResult | null
  /** 错误信息 */
  error: string | null
  /** 提交推演请求 */
  submit: (request: SandboxSubmitInput) => Promise<void>
  /** 重置状态 */
  reset: () => void
}

export function useSandboxSubmit(): UseSandboxSubmitReturn {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reset = useCallback(() => {
    setIsRunning(false)
    setResult(null)
    setError(null)
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const submit = useCallback(
    async (request: SandboxSubmitInput) => {
      reset()
      setIsRunning(true)
      setError(null)

      try {
        const { taskId } = await submitSandbox(request)

        // 轮询获取结果（每 2s 一次，最多 60s）
        const maxAttempts = 30
        let attempts = 0

        pollingRef.current = setInterval(async () => {
          attempts++
          try {
            const scenarioResult = await fetchScenarioResult(taskId)
            if (pollingRef.current) clearInterval(pollingRef.current)
            pollingRef.current = null
            setResult(scenarioResult)
            setIsRunning(false)
          } catch (err) {
            if (attempts >= maxAttempts) {
              if (pollingRef.current) clearInterval(pollingRef.current)
              pollingRef.current = null
              setError(err instanceof Error ? err.message : "获取结果失败")
              setIsRunning(false)
            }
          }
        }, 2000)
      } catch (err) {
        setIsRunning(false)
        setError(err instanceof Error ? err.message : "提交推演失败")
      }
    },
    [reset],
  )

  return { isRunning, result, error, submit, reset }
}
