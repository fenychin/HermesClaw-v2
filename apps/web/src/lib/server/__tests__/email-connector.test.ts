/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  initializeEmailConnector,
  renderEmailTemplate,
  checkRateLimit,
  sendEmail,
  EMAIL_CONNECTOR_CAPABILITY_ID,
  LeaseTokenValidationError
} from "../connectors/email-connector"
import { prisma } from "@/lib/prisma"

// Mock Prisma
const mockFindUnique = vi.fn()
const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()
const mockTransaction = vi.fn()
const mockWriteAuditLog = vi.fn()
const mockApprovalFindUnique = vi.fn()

vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
  actorFromSession: () => Promise.resolve("system"),
}))

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    connector: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    emailTemplate: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    emailSendLog: {
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
      count: (...args: any[]) => mockCount(...args),
    },
    capabilityVersion: {
      findUnique: vi.fn(),
    },
    connectorLease: {
      findUnique: vi.fn()
    },
    approvalCheckpoint: {
      findUnique: (...args: any[]) => mockApprovalFindUnique(...args)
    },
    $transaction: (...args: any[]) => mockTransaction(...args)
  }
  return { prisma: mockPrisma }
})

// Mock Capability Registry
vi.mock("../capability-registry", () => ({
  registerCapability: vi.fn().mockResolvedValue({}),
  recordCapabilityUsage: vi.fn().mockResolvedValue({})
}))


describe("Email Connector Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation((cb) => cb(prisma))
  })

  describe("initializeEmailConnector", () => {
    it("若已存在该版本的注册，应幂等直接返回", async () => {
      vi.mocked(prisma.capabilityVersion.findUnique).mockResolvedValueOnce({ id: "1" } as any)
      
      await initializeEmailConnector("ws-1", { writeAuditLog: mockWriteAuditLog })

      expect(mockFindUnique).not.toHaveBeenCalled()
      expect(mockWriteAuditLog).not.toHaveBeenCalled()
    })

    it("若不存在注册，应在 Connector 表中创建对应记录并注册能力", async () => {
      vi.mocked(prisma.capabilityVersion.findUnique).mockResolvedValueOnce(null)
      mockFindUnique.mockResolvedValueOnce(null) // connector不存在
      mockCreate.mockResolvedValueOnce({ id: EMAIL_CONNECTOR_CAPABILITY_ID })

      await initializeEmailConnector("ws-1", { writeAuditLog: mockWriteAuditLog })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: EMAIL_CONNECTOR_CAPABILITY_ID
          })
        })
      )
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "connector.initialized",
          targetId: EMAIL_CONNECTOR_CAPABILITY_ID
        })
      )
    })
  })

  describe("renderEmailTemplate", () => {
    it("正常模板解析，支持 Mustache 语法", async () => {
      mockFindFirst.mockResolvedValueOnce({
        templateId: "tpl-1",
        subject: "Hello {{name}}",
        bodyHtml: "<p>Welcome to {{site}}!</p>",
        bodyText: "Welcome to {{site}}!"
      })

      const rendered = await renderEmailTemplate(
        "tpl-1",
        "ws-1",
        { name: "Frank", site: "HermesClaw" },
        undefined,
        { writeAuditLog: mockWriteAuditLog }
      )

      expect(rendered.subject).toBe("Hello Frank")
      expect(rendered.bodyHtml).toBe("<p>Welcome to HermesClaw!</p>")
      expect(rendered.bodyText).toBe("Welcome to HermesClaw!")
      expect(mockWriteAuditLog).not.toHaveBeenCalled()
    })

    it("缺少占位符变量时保留原占位符并记录 WARNING 审计日志", async () => {
      mockFindFirst.mockResolvedValueOnce({
        templateId: "tpl-1",
        subject: "Hello {{name}}",
        bodyHtml: "<p>Welcome to {{site}}!</p>",
        bodyText: "Welcome to {{site}}!"
      })

      const rendered = await renderEmailTemplate(
        "tpl-1",
        "ws-1",
        { name: "Frank" }, // 缺 site
        undefined,
        { writeAuditLog: mockWriteAuditLog }
      )

      expect(rendered.bodyHtml).toBe("<p>Welcome to {{site}}!</p>")
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "email.template.warning",
          detail: expect.stringContaining("site")
        })
      )
    })

    it("injectUnsubscribeLink 正确注入退订区块", async () => {
      mockFindFirst.mockResolvedValueOnce({
        templateId: "tpl-1",
        subject: "Marketing Subject",
        bodyHtml: "<body>Content</body>",
        bodyText: "Content"
      })

      const rendered = await renderEmailTemplate(
        "tpl-1",
        "ws-1",
        {},
        { injectUnsubscribeLink: true, unsubscribeUrl: "https://unsubscribe.url" },
        { writeAuditLog: mockWriteAuditLog }
      )

      expect(rendered.bodyHtml).toContain("https://unsubscribe.url")
      expect(rendered.bodyHtml).toContain("</body>")
      expect(rendered.bodyText).toContain("If you wish to unsubscribe")
    })
  })

  describe("checkRateLimit", () => {
    it("未超限时，应扣减并返回 remaining 令牌数", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 10,
        rateLimitResetAt: new Date(Date.now() + 1800 * 1000)
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)

      const result = await checkRateLimit("built-in.email", 5)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(85) // 100 - (10 + 5)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rateLimitUsed: 15
          })
        })
      )
    })

    it("已超限时，应返回 allowed: false", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 98,
        rateLimitResetAt: new Date(Date.now() + 1800 * 1000)
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)

      const result = await checkRateLimit("built-in.email", 5)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(2)
    })

    it("Reset 时间已过期时，应重置计数器为 0 并重新计算", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 95,
        rateLimitResetAt: new Date(Date.now() - 1000) // 已过期
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)

      const result = await checkRateLimit("built-in.email", 10)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(90) // 100 - 10
    })
  })

  describe("sendEmail", () => {
    it("成功发送：记录发送日志与成功审计", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 0,
        rateLimitResetAt: null,
        config: {
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: { user: "test@hermesclaw.ai", pass: "smtpPass" }
        }
      }
      // checkRateLimit + sendEmail 两个 findUnique 注入
      mockFindUnique.mockResolvedValueOnce(mockConn) // for checkRateLimit
      mockFindUnique.mockResolvedValueOnce(mockConn) // for sendEmail config

      mockCreate.mockResolvedValueOnce({ id: "log-1" }) // EmailSendLog

      const mockSendSmtp = vi.fn().mockResolvedValue({ messageId: "msg-123" })

      const result = await sendEmail({
        connectorId: "built-in.email",
        workspaceId: "ws-1",
        from: { address: "test@hermesclaw.ai" },
        to: [{ address: "target@external.com" }],
        subject: "Direct Subject",
        bodyHtml: "<p>Content</p>"
      }, {
        writeAuditLog: mockWriteAuditLog,
        sendSmtp: mockSendSmtp
      })

      expect(result.status).toBe("sent")
      expect(result.messageId).toBe("msg-123")
      expect(mockSendSmtp).toHaveBeenCalled()
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "email.sent"
        })
      )
    })

    it("模版发送：根据 templateId 触发渲染且发送", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 0,
        rateLimitResetAt: null,
        config: { host: "smtp.gmail.com", auth: { pass: "smtpPass" } }
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockCreate.mockResolvedValueOnce({ id: "log-1" })

      // renderEmailTemplate findFirst
      mockFindFirst.mockResolvedValueOnce({
        templateId: "tpl-1",
        subject: "Hello {{name}}",
        bodyHtml: "<p>HTML</p>",
        bodyText: "Text"
      })

      const mockSendSmtp = vi.fn().mockResolvedValue({ messageId: "msg-123" })

      const result = await sendEmail({
        connectorId: "built-in.email",
        workspaceId: "ws-1",
        from: { address: "test@hermesclaw.ai" },
        to: [{ address: "target@external.com" }],
        subject: "",
        bodyHtml: "",
        templateId: "tpl-1",
        templateVariables: { name: "Frank" }
      }, {
        writeAuditLog: mockWriteAuditLog,
        sendSmtp: mockSendSmtp
      })

      expect(result.status).toBe("sent")
      expect(mockSendSmtp).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          subject: "Hello Frank"
        })
      )
    })

    it("限流超额时：抛出错误并记发送失败日志", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 98,
        rateLimitResetAt: new Date(Date.now() + 3600 * 1000)
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockCreate.mockResolvedValueOnce({ id: "log-1" })

      const result = await sendEmail({
        connectorId: "built-in.email",
        workspaceId: "ws-1",
        from: { address: "test@hermesclaw.ai" },
        to: [{ address: "target1@external.com" }, { address: "target2@external.com" }, { address: "target3@external.com" }],
        subject: "Direct Subject",
        bodyHtml: "<p>Content</p>"
      }, {
        writeAuditLog: mockWriteAuditLog
      })

      expect(result.status).toBe("failed")
      expect(result.errorCode).toBe("RateLimitExceededError")
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "email.failed"
        })
      )
    })

    it("SMTP 前两次失败第三次重试成功：正确记录重试", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 0,
        config: { host: "smtp.gmail.com", auth: { pass: "smtpPass" } }
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockCreate.mockResolvedValueOnce({ id: "log-1" })

      // Mock SMTP 发送，前两次 throw 错误，第三次成功
      const mockSendSmtp = vi.fn()
        .mockRejectedValueOnce(new Error("SMTP Server Busy"))
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce({ messageId: "msg-retry-123" })

      const result = await sendEmail({
        connectorId: "built-in.email",
        workspaceId: "ws-1",
        from: { address: "test@hermesclaw.ai" },
        to: [{ address: "target@external.com" }],
        subject: "Direct",
        bodyHtml: "Content"
      }, {
        writeAuditLog: mockWriteAuditLog,
        sendSmtp: mockSendSmtp
      })

      expect(result.status).toBe("sent")
      expect(result.messageId).toBe("msg-retry-123")
      expect(mockSendSmtp).toHaveBeenCalledTimes(3)
      // 更新成功日志时应该记下 retryCount = 2
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "sent",
            retryCount: 2
          })
        })
      )
    })

    it("SMTP 重试耗尽失败：置为 failed 并写审计日志", async () => {
      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 0,
        config: { host: "smtp.gmail.com", auth: { pass: "smtpPass" } }
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockCreate.mockResolvedValueOnce({ id: "log-1" })

      const mockSendSmtp = vi.fn().mockRejectedValue(new Error("Fatal SMTP error"))

      const result = await sendEmail({
        connectorId: "built-in.email",
        workspaceId: "ws-1",
        from: { address: "test@hermesclaw.ai" },
        to: [{ address: "target@external.com" }],
        subject: "Direct",
        bodyHtml: "Content"
      }, {
        writeAuditLog: mockWriteAuditLog,
        sendSmtp: mockSendSmtp
      })

      expect(result.status).toBe("failed")
      expect(mockSendSmtp).toHaveBeenCalledTimes(3)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: "Fatal SMTP error",
            retryCount: 3
          })
        })
      )
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "email.failed"
        })
      )
    })

    it("SMTP 密码 env: 前缀正确从 process.env 读取", async () => {
      const originalEnv = process.env.TEST_SMTP_PASS
      process.env.TEST_SMTP_PASS = "decrypted-pass-value"

      const mockConn = {
        id: "built-in.email",
        rateLimit: 100,
        rateLimitUsed: 0,
        config: {
          host: "smtp.gmail.com",
          auth: { user: "test", pass: "env:TEST_SMTP_PASS" }
        }
      }
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockFindUnique.mockResolvedValueOnce(mockConn)
      mockCreate.mockResolvedValueOnce({ id: "log-1" })

      const mockSendSmtp = vi.fn().mockResolvedValue({ messageId: "msg-1" })

      await sendEmail({
        connectorId: "built-in.email",
        workspaceId: "ws-1",
        from: { address: "test@hermesclaw.ai" },
        to: [{ address: "target@external.com" }],
        subject: "Direct",
        bodyHtml: "Content"
      }, {
        writeAuditLog: mockWriteAuditLog,
        sendSmtp: mockSendSmtp
      })

      // 验证最终传递给 SMTP 的配置中解密了密码
      expect(mockSendSmtp).toHaveBeenCalled()
      const passedConfig = mockSendSmtp.mock.calls[0][0]
      expect(passedConfig.auth.pass).toBe("decrypted-pass-value")

      // 恢复 env
      process.env.TEST_SMTP_PASS = originalEnv
    })

    describe("高危批量发信及租约/令牌校验", () => {
      it("批量发信（to > 10）且无 leaseToken 应抛出 LeaseTokenValidationError", async () => {
        const recipients = Array.from({ length: 11 }, (_, i) => ({ address: `target${i}@external.com` }))
        await expect(
          sendEmail({
            connectorId: "built-in.email",
            workspaceId: "ws-1",
            from: { address: "test@hermesclaw.ai" },
            to: recipients,
            subject: "Batch without lease",
            bodyHtml: "Content"
          })
        ).rejects.toThrow(LeaseTokenValidationError)
      })

      it("批量发信传入无效的前缀令牌应抛出 LeaseTokenValidationError", async () => {
        const recipients = Array.from({ length: 11 }, (_, i) => ({ address: `target${i}@external.com` }))
        await expect(
          sendEmail({
            connectorId: "built-in.email",
            workspaceId: "ws-1",
            from: { address: "test@hermesclaw.ai" },
            to: recipients,
            subject: "Batch with invalid lease",
            bodyHtml: "Content",
            leaseToken: "invalid-token"
          })
        ).rejects.toThrow(LeaseTokenValidationError)
      })

      it("批量发信传入 lease- 前缀在内存测试中应该放行", async () => {
        const recipients = Array.from({ length: 11 }, (_, i) => ({ address: `target${i}@external.com` }))
        const mockConn = {
          id: "built-in.email",
          rateLimit: 100,
          rateLimitUsed: 0,
          config: { host: "smtp.gmail.com", auth: { pass: "smtpPass" } }
        }
        mockFindUnique.mockResolvedValueOnce(mockConn)
        mockFindUnique.mockResolvedValueOnce(mockConn)
        mockCreate.mockResolvedValueOnce({ id: "log-1" })
        const mockSendSmtp = vi.fn().mockResolvedValue({ messageId: "msg-123" })

        const result = await sendEmail({
          connectorId: "built-in.email",
          workspaceId: "ws-1",
          from: { address: "test@hermesclaw.ai" },
          to: recipients,
          subject: "Batch with lease- prefix",
          bodyHtml: "Content",
          leaseToken: "lease-123"
        }, {
          writeAuditLog: mockWriteAuditLog,
          sendSmtp: mockSendSmtp
        })

        expect(result.status).toBe("sent")
        expect(result.compensationStrategy).toBe("manual/none")
        expect(mockSendSmtp).toHaveBeenCalled()
      })

      it("批量发信传入 acp- 审批令牌且未审批通过应抛出 LeaseTokenValidationError", async () => {
        const recipients = Array.from({ length: 11 }, (_, i) => ({ address: `target${i}@external.com` }))
        mockApprovalFindUnique.mockResolvedValueOnce({
          checkpointId: "acp-123",
          decision: "rejected",
          expiresAt: new Date(Date.now() + 3600000),
          workspaceId: "ws-1"
        })

        await expect(
          sendEmail({
            connectorId: "built-in.email",
            workspaceId: "ws-1",
            from: { address: "test@hermesclaw.ai" },
            to: recipients,
            subject: "Batch with rejected acp",
            bodyHtml: "Content",
            leaseToken: "acp-123"
          })
        ).rejects.toThrow(LeaseTokenValidationError)
      })

      it("批量发信传入 acp- 审批令牌已过期应抛出 LeaseTokenValidationError", async () => {
        const recipients = Array.from({ length: 11 }, (_, i) => ({ address: `target${i}@external.com` }))
        mockApprovalFindUnique.mockResolvedValueOnce({
          checkpointId: "acp-123",
          decision: "approved",
          expiresAt: new Date(Date.now() - 3600000), // 已过期
          workspaceId: "ws-1"
        })

        await expect(
          sendEmail({
            connectorId: "built-in.email",
            workspaceId: "ws-1",
            from: { address: "test@hermesclaw.ai" },
            to: recipients,
            subject: "Batch with expired acp",
            bodyHtml: "Content",
            leaseToken: "acp-123"
          })
        ).rejects.toThrow(LeaseTokenValidationError)
      })

      it("批量发信传入合法的 acp- 审批令牌应正常发送且写入 approval.verified 对账日志", async () => {
        const recipients = Array.from({ length: 11 }, (_, i) => ({ address: `target${i}@external.com` }))
        const mockConn = {
          id: "built-in.email",
          rateLimit: 100,
          rateLimitUsed: 0,
          config: { host: "smtp.gmail.com", auth: { pass: "smtpPass" } }
        }
        mockFindUnique.mockResolvedValueOnce(mockConn)
        mockFindUnique.mockResolvedValueOnce(mockConn)
        mockCreate.mockResolvedValueOnce({ id: "log-1" })
        mockApprovalFindUnique.mockResolvedValueOnce({
          checkpointId: "acp-123",
          decision: "approved",
          expiresAt: new Date(Date.now() + 3600000),
          workspaceId: "ws-1"
        })
        const mockSendSmtp = vi.fn().mockResolvedValue({ messageId: "msg-123" })

        const result = await sendEmail({
          connectorId: "built-in.email",
          workspaceId: "ws-1",
          from: { address: "test@hermesclaw.ai" },
          to: recipients,
          subject: "Batch with valid acp- prefix",
          bodyHtml: "Content",
          leaseToken: "acp-123"
        }, {
          writeAuditLog: mockWriteAuditLog,
          sendSmtp: mockSendSmtp
        })

        expect(result.status).toBe("sent")
        expect(mockSendSmtp).toHaveBeenCalled()
        // 应该写入 approval.verified 对账审计日志
        expect(mockWriteAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "approval.verified",
            targetId: "acp-123"
          })
        )
      })
    })
  })
})
