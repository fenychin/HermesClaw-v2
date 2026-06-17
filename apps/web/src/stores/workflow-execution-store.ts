/**
 * 工作流执行状态 Store（Zustand）
 * —— 管理单个工作流实例的执行进度、步骤状态、输入与输出数据
 * —— 该 Store 为客户端 UI 交互态，不持久化
 */

import { create } from 'zustand'
import type { WorkflowStepStatus } from '@/types/workflow'

// ============================================================
// 类型定义
// ============================================================

/** 单个步骤的状态快照 */
export interface StepStateSnapshot {
  /** 步骤状态 */
  status: WorkflowStepStatus
  /** 用户输入值（key → value） */
  inputs: Record<string, string>
  /** 步骤输出值（key → value） */
  outputs: Record<string, string>
  /** 步骤执行耗时（秒），completed 后填充 */
  durationSec?: number
}

/** 工作流执行 Store 的 State 结构 */
interface WorkflowExecutionState {
  /** 当前绑定的工作流 id（切换工作流时重置） */
  workflowId: string | null
  /** 当前激活步骤的索引（0-based） */
  currentStepIndex: number
  /** 各步骤的执行状态快照，索引与工作流 steps 数组对应 */
  stepStates: StepStateSnapshot[]
}

/** 工作流执行 Store 的 Actions */
interface WorkflowExecutionActions {
  /**
   * 启动工作流执行
   * @param workflowId 工作流 id
   * @param stepCount 步骤总数（用于初始化 stepStates 数组长度）
   */
  startWorkflow: (workflowId: string, stepCount: number) => void

  /**
   * 更新当前步骤的用户输入值（实时暂存，未提交）
   * @param stepIndex 步骤索引
   * @param key 输入字段 key
   * @param value 输入值
   */
  updateStepInput: (stepIndex: number, key: string, value: string) => void

  /**
   * 提交当前步骤输入，将整批 inputs 合并到状态
   * @param stepIndex 步骤索引
   * @param inputs 完整输入键值对
   */
  submitStepInput: (stepIndex: number, inputs: Record<string, string>) => void

  /**
   * 将指定步骤标记为已完成并填充输出
   * @param stepIndex 步骤索引
   * @param outputs 输出键值对
   * @param durationSec 耗时秒数（可选）
   */
  completeStep: (
    stepIndex: number,
    outputs: Record<string, string>,
    durationSec?: number,
  ) => void

  /**
   * 推进到下一步骤（将 currentStepIndex + 1，并将下步状态设为 running）
   */
  advanceToNextStep: () => void

  /**
   * 跳转到指定步骤，并将该步及其后的步骤状态重置为 pending，将目标步设为 running
   */
  goToStep: (stepIndex: number) => void

  /**
   * 重置整个工作流执行状态（回到初始空态）
   */
  resetWorkflow: () => void
}

// ============================================================
// 初始空态工厂
// ============================================================

/** 生成单步的初始状态 */
function createInitialStepState(): StepStateSnapshot {
  return {
    status: 'pending',
    inputs: {},
    outputs: {},
  }
}

/** 生成工作流执行 Store 的初始 State */
const INITIAL_STATE: WorkflowExecutionState = {
  workflowId: null,
  currentStepIndex: 0,
  stepStates: [],
}

// ============================================================
// Store 实现
// ============================================================

export const useWorkflowExecutionStore = create<
  WorkflowExecutionState & WorkflowExecutionActions
>((set, get) => ({
  // ——— 初始状态 ———
  ...INITIAL_STATE,

  // ——— 动作实现 ———

  startWorkflow: (workflowId, stepCount) => {
    set({
      workflowId,
      currentStepIndex: 0,
      // 第 0 步立即置为 running，其余 pending
      stepStates: Array.from({ length: stepCount }, (_, i) =>
        i === 0
          ? { ...createInitialStepState(), status: 'running' }
          : createInitialStepState(),
      ),
    })
  },

  updateStepInput: (stepIndex, key, value) => {
    set((state) => {
      const stepStates = [...state.stepStates]
      const step = stepStates[stepIndex]
      if (!step) return state
      stepStates[stepIndex] = {
        ...step,
        inputs: { ...step.inputs, [key]: value },
      }
      return { stepStates }
    })
  },

  submitStepInput: (stepIndex, inputs) => {
    set((state) => {
      const stepStates = [...state.stepStates]
      const step = stepStates[stepIndex]
      if (!step) return state
      stepStates[stepIndex] = {
        ...step,
        inputs: { ...step.inputs, ...inputs },
      }
      return { stepStates }
    })
  },

  completeStep: (stepIndex, outputs, durationSec) => {
    set((state) => {
      const stepStates = [...state.stepStates]
      const step = stepStates[stepIndex]
      if (!step) return state
      stepStates[stepIndex] = {
        ...step,
        status: 'completed',
        outputs: { ...step.outputs, ...outputs },
        durationSec,
      }
      return { stepStates }
    })
  },

  advanceToNextStep: () => {
    const { currentStepIndex, stepStates } = get()
    const nextIdx = currentStepIndex + 1
    if (nextIdx >= stepStates.length) return

    set((state) => {
      const stepStates = [...state.stepStates]
      // 将下一步骤设为 running
      stepStates[nextIdx] = { ...stepStates[nextIdx], status: 'running' }
      return {
        currentStepIndex: nextIdx,
        stepStates,
      }
    })
  },

  goToStep: (stepIndex) => {
    set((state) => {
      const stepStates = state.stepStates.map((step, idx) => {
        if (idx < stepIndex) return step
        if (idx === stepIndex) return { ...step, status: 'running' as const }
        return { ...step, status: 'pending' as const }
      })
      return { currentStepIndex: stepIndex, stepStates }
    })
  },

  resetWorkflow: () => {
    set({ ...INITIAL_STATE })
  },
}))
