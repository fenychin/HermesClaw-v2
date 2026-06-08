/**
 * 工具函数测试
 * —— 覆盖 API 通用工具函数和限流逻辑
 */
import { describe, it, expect } from 'vitest'
import { parseJsonField, stringifyJsonField } from '@/lib/api-utils'
import { rateLimit } from '@/lib/rate-limit'

// ==============================
// parseJsonField
// ==============================

describe('parseJsonField', () => {
  it('应该解析合法 JSON 字符串', () => {
    expect(parseJsonField('["a","b"]', [])).toEqual(['a', 'b'])
  })

  it('应该在解析失败时返回默认值', () => {
    expect(parseJsonField('invalid json', [])).toEqual([])
  })

  it('应该在 null 时返回默认值', () => {
    expect(parseJsonField(null, 'default')).toBe('default')
  })

  it('应该在 undefined 时返回默认值', () => {
    expect(parseJsonField(undefined, 'fallback')).toBe('fallback')
  })

  it('应该解析对象 JSON', () => {
    expect(parseJsonField('{"key":"value"}', {})).toEqual({ key: 'value' })
  })

  it('应该解析数字 JSON', () => {
    expect(parseJsonField('42', 0)).toBe(42)
  })
})

// ==============================
// stringifyJsonField
// ==============================

describe('stringifyJsonField', () => {
  it('应该序列化数组为 JSON 字符串', () => {
    expect(stringifyJsonField(['a', 'b'])).toBe('["a","b"]')
  })

  it('应该在 null/undefined 时返回空数组 JSON', () => {
    expect(stringifyJsonField(null)).toBe('[]')
    expect(stringifyJsonField(undefined)).toBe('[]')
  })

  it('应该序列化对象', () => {
    expect(stringifyJsonField({ key: 'value' })).toBe('{"key":"value"}')
  })
})

// ==============================
// rateLimit
// ==============================

describe('rateLimit', () => {
  it('应该允许限额内的请求', () => {
    const result = rateLimit('test-ip-1', 5, 60000)
    expect(result).toBe(true)
  })

  it('应该拒绝超过限额的请求', () => {
    const ip = 'test-ip-2'
    for (let i = 0; i < 5; i++) {
      rateLimit(ip, 5, 60000)
    }
    const result = rateLimit(ip, 5, 60000)
    expect(result).toBe(false)
  })

  it('不同 IP 应该独立计数', () => {
    const ipA = 'test-ip-a'
    // 消耗 ipA 的所有额度
    for (let i = 0; i < 3; i++) {
      rateLimit(ipA, 3, 60000)
    }
    expect(rateLimit(ipA, 3, 60000)).toBe(false)
    // ipB 不受影响
    expect(rateLimit('test-ip-b', 3, 60000)).toBe(true)
  })

  it('窗口过期后应该重置计数', async () => {
    const ip = 'test-ip-reset'
    // 极短窗口
    rateLimit(ip, 2, 50)
    rateLimit(ip, 2, 50)
    expect(rateLimit(ip, 2, 50)).toBe(false)
    // 等待窗口过期
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(rateLimit(ip, 2, 50)).toBe(true)
  })
})
