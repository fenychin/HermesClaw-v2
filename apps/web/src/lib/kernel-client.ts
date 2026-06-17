import type { KernelIntent, WorkflowPlan } from '@hermesclaw/hermes-kernel'

export async function planWorkflow(intent: KernelIntent): Promise<WorkflowPlan> {
  const res = await fetch('/api/orchestration', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(intent),
  })
  if (!res.ok) {
    throw new Error(`Failed to plan workflow: ${res.statusText}`)
  }
  return res.json()
}
