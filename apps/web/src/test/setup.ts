import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('@/lib/auth', () => {
  return {
    auth: vi.fn(async () => ({
      user: {
        id: 'user-e2e-123',
        email: 'e2e-admin@hermesclaw.ai',
        name: 'E2E Admin',
        role: 'ADMIN'
      }
    })),
    handlers: {
      GET: vi.fn(),
      POST: vi.fn()
    },
    signIn: vi.fn(),
    signOut: vi.fn()
  }
})

// 全局模拟 fetch 请求，防止在单元与集成测试中发起真实跨网物理请求导致测试超时与挂起
global.fetch = vi.fn().mockImplementation(async (url) => {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, mock: true, url }),
    json: async () => ({ success: true, mock: true, url }),
  } as Response
})

