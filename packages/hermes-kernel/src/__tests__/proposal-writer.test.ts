import { describe, it, expect, vi } from 'vitest'
import { writeProposalsFromEvaluation } from '../harness/proposal-writer'
import type { EvaluationResult } from '../harness'

function makeMockPrisma(overrides: Partial<Record<string, any>> = {}) {
  const base = {
    harnessProposal: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({
        id: 'prop_' + Math.random().toString(36).slice(2, 8),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    auditLog: {
      create: vi.fn(async () => ({})),
    },
  }
  return { ...base, ...overrides } as any
}

const sampleResults: EvaluationResult[] = [
  {
    signal: { type: 'workflow_failure', agentId: 'agent-a', count: 5, detail: 'Workflow timeout' },
    severity: 'high',
    suggestion: 'Increase workflow timeout threshold',
    proposalType: 'workflow_template',
  },
  {
    signal: { type: 'connector_error', agentId: 'agent-b', count: 3, detail: 'SMTP connection failed' },
    severity: 'medium',
    suggestion: 'Add retry mechanism to email connector',
    proposalType: 'connector_policy',
  },
  {
    signal: { type: 'memory_miss', count: 12, detail: 'Frequently missing customer preferences' },
    severity: 'low',
    suggestion: 'Persist customer preference data',
    proposalType: 'memory_policy',
  },
]

describe('writeProposalsFromEvaluation', () => {
  it('场景1: 3个 EvaluationResult，无重复 — created=3', async () => {
    const prisma = makeMockPrisma()
    const result = await writeProposalsFromEvaluation({
      workspaceId: 'ws-1',
      results: sampleResults,
      prisma,
    })

    expect(result.created).toBe(3)
    expect(result.skipped).toBe(0)
    expect(prisma.harnessProposal.create).toHaveBeenCalledTimes(3)
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'harness.proposals.auto_generated',
        actor: 'system',
        targetType: 'proposal',
        targetId: 'ws-1',
        detail: JSON.stringify({ count: 3 }),
        workspaceId: 'ws-1',
      },
    })
  })

  it('场景2: 1个critical → status=pending，1个low → status=draft', async () => {
    const prisma = makeMockPrisma()
    const results: EvaluationResult[] = [
      {
        signal: { type: 'kpi_drift', count: 1, detail: 'Revenue KPI off by 15%' },
        severity: 'critical',
        suggestion: 'Re-evaluate revenue forecast model',
        proposalType: 'eval_rule',
      },
      {
        signal: { type: 'human_correction', count: 2, detail: 'Users correcting agent output' },
        severity: 'low',
        suggestion: 'Improve response accuracy',
        proposalType: 'skill_binding',
      },
    ]

    const result = await writeProposalsFromEvaluation({
      workspaceId: 'ws-1',
      results,
      prisma,
    })

    expect(result.created).toBe(2)
    expect(result.skipped).toBe(0)

    const calls = prisma.harnessProposal.create.mock.calls
    expect(calls[0][0].data.status).toBe('pending')
    expect(calls[1][0].data.status).toBe('draft')
  })

  it('场景3: 7天内已有相同类型提案 — skipped=1', async () => {
    const findFirstMock = vi.fn(async (args: any) => {
      if (args.where.signalSnapshot?.contains === 'workflow_failure') {
        return { id: 'existing-proposal' }
      }
      return null
    })

    const prisma = makeMockPrisma({
      harnessProposal: {
        findFirst: findFirstMock,
        create: vi.fn(async ({ data }: any) => ({
          id: 'prop_' + Math.random().toString(36).slice(2, 8),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    })

    const result = await writeProposalsFromEvaluation({
      workspaceId: 'ws-1',
      results: sampleResults,
      prisma,
    })

    expect(result.created).toBe(2)
    expect(result.skipped).toBe(1)
    expect(prisma.harnessProposal.create).toHaveBeenCalledTimes(2)
  })
})
