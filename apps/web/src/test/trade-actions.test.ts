/**
 * TRADE_ACTIONS L1-L4 分级测试
 * —— 确保自动化授权分级的硬约束不被破坏
 */
import { describe, it, expect } from 'vitest'
import { TRADE_ACTIONS, automationLevelFromRisk } from '@/types/harness'

describe('TRADE_ACTIONS L1-L4 分级', () => {
  it('L4 操作必须 requiresApproval = true', () => {
    const l4Actions = TRADE_ACTIONS.filter(a => a.automationLevel === 'L4')
    expect(l4Actions.length).toBeGreaterThan(0)
    l4Actions.forEach(action => {
      expect(action.requiresApproval).toBe(true)
    })
  })

  it('L1 操作必须 requiresApproval = false', () => {
    const l1Actions = TRADE_ACTIONS.filter(a => a.automationLevel === 'L1')
    expect(l1Actions.length).toBeGreaterThan(0)
    l1Actions.forEach(action => {
      expect(action.requiresApproval).toBe(false)
    })
  })

  it('L4 操作必须 dangerousIfFailed = true', () => {
    const l4Actions = TRADE_ACTIONS.filter(a => a.automationLevel === 'L4')
    expect(l4Actions.length).toBeGreaterThan(0)
    l4Actions.forEach(action => {
      expect(action.dangerousIfFailed).toBe(true)
    })
  })

  it('所有动作必须有唯一 id', () => {
    const ids = TRADE_ACTIONS.map(a => a.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('L3 操作必须 requiresApproval = true', () => {
    const l3Actions = TRADE_ACTIONS.filter(a => a.automationLevel === 'L3')
    expect(l3Actions.length).toBeGreaterThan(0)
    l3Actions.forEach(action => {
      expect(action.requiresApproval).toBe(true)
    })
  })

  it('所有级别都应出现在 TRADE_ACTIONS 中', () => {
    const levels = new Set(TRADE_ACTIONS.map(a => a.automationLevel))
    expect(levels.has('L1')).toBe(true)
    expect(levels.has('L2')).toBe(true)
    expect(levels.has('L3')).toBe(true)
    expect(levels.has('L4')).toBe(true)
  })
})

describe('automationLevelFromRisk', () => {
  it('high → L3', () => {
    expect(automationLevelFromRisk('high')).toBe('L3')
  })

  it('mid → L2', () => {
    expect(automationLevelFromRisk('medium')).toBe('L2')
  })

  it('low → L1', () => {
    expect(automationLevelFromRisk('low')).toBe('L1')
  })
})
