import { z } from 'zod'
import type { TaskEnvelope } from '@hermesclaw/event-contracts'

export const MemoryScopeSchema = z.enum(['session', 'project', 'org'])
export type MemoryScope = z.infer<typeof MemoryScopeSchema>

export interface KernelIntent {
  workspaceId: string
  userId: string
  scope: MemoryScope
  raw: string
  context?: Record<string, unknown>
}

export interface WorkflowPlan {
  taskEnvelopes: TaskEnvelope[]
  estimatedSteps: number
  requiresApproval: boolean
  automationLevel: 1 | 2 | 3 | 4  // L1-L4 授权等级
}
