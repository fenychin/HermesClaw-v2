// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Mock harness-eval 避免导入大模型 SDK 以及 next-auth
vi.mock("@/lib/server/hermes/harness-eval", () => ({
  isErrorStatus: (status: string) =>
    ["error", "failed", "failure", "timeout", "失败", "超时", "异常"].includes(
      (status || "").toLowerCase()
    ),
}));

import { getBrainStats } from "@/lib/server/hermes/brain";
import { guardOutput } from "@/lib/server/shared/output-guard";
import { getSkillsWithStats } from "@/lib/server/hermes/skills";
import { getEnrichedConnectors } from "@/lib/server/shared/connectors";
import type { prisma } from "@/lib/prisma";

describe("智慧大脑 (Brain) 模块健康度测试", () => {
  describe("getBrainStats - 脑指标聚合服务", () => {
    it("在没有日志或异常时能安全降级并输出预设的基准数据", async () => {
      // 模拟 Prisma 报错
      const mockPrismaError = {
        agentLog: {
          count: vi.fn().mockRejectedValue(new Error("Database connection timeout")),
        },
        memory: {
          count: vi.fn().mockRejectedValue(new Error("Database connection timeout")),
        },
      } as unknown as typeof prisma;

      const stats = await getBrainStats("default", { prisma: mockPrismaError });
      expect(stats.hitRate).toBe(84.6);
      expect(stats.tokensSaved).toBe(53400);
      expect(stats.knowledgeGaps.length).toBeGreaterThan(0);
      expect(stats.knowledgeGaps[0].resolved).toBe(false);
    });

    it("在日志丰富时能通过数据库 COUNT 计算正确的命中率", async () => {
      const mockPrismaSuccess = {
        agentLog: {
          count: vi.fn().mockImplementation(({ where }) => {
            if (!where.OR) {
              // totalLogs
              return Promise.resolve(100);
            }
            if (where.OR.some((cond: any) => cond.status)) {
              // errorLogsCount
              return Promise.resolve(10);
            }
            if (where.OR.some((cond: any) => cond.detail)) {
              // hitLogsCount
              return Promise.resolve(70);
            }
            return Promise.resolve(0);
          }),
        },
        memory: {
          count: vi.fn().mockImplementation(({ where }) => {
            const andConds = where.AND || [];
            const hasSaudi = andConds.some((cond: any) =>
              cond.OR.some((orCond: any) => orCond.content?.contains === "沙特")
            );
            const hasTariff = andConds.some((cond: any) =>
              cond.OR.some((orCond: any) => orCond.content?.contains === "关税")
            );
            if (hasSaudi && hasTariff) {
              return Promise.resolve(1);
            }
            return Promise.resolve(0);
          }),
        },
      } as unknown as typeof prisma;

      const stats = await getBrainStats("default", { prisma: mockPrismaSuccess });
      // totalLogs = 100, errorLogsCount = 10 -> successRate = 0.9
      // hitLogsCount = 70 -> rawRate = 70%
      // hitRate = Math.min(98.5, Math.max(65.0, 70 + 0.9 * 20)) = Math.min(98.5, 88.0) = 88.0%
      expect(stats.hitRate).toBe(88);
      // 知识盲区中包含关键字 "沙特" 和 "关税" 的 gap-001 应该被标为 resolved: true
      const gapSaudiTariff = stats.knowledgeGaps.find((g) => g.id === "gap-001");
      expect(gapSaudiTariff?.resolved).toBe(true);
      // gap-002 "沙特 D/P 托收" 应该为 resolved: false
      const gapSaudiDP = stats.knowledgeGaps.find((g) => g.id === "gap-002");
      expect(gapSaudiDP?.resolved).toBe(false);
    });
  });

  describe("guardOutput - 记忆安全护栏", () => {
    it("拒绝过短的输入", () => {
      const res = guardOutput("  ", { minLength: 3 });
      expect(res.ok).toBe(false);
      expect(res.reason).toContain("过短");
    });

    it("拒绝过长的输入", () => {
      const res = guardOutput("a".repeat(100), { maxLength: 50 });
      expect(res.ok).toBe(false);
      expect(res.reason).toContain("超出长度上限");
    });

    it("拒绝包含敏感命令行注入词的文本", () => {
      const res1 = guardOutput("这是一条包含了已绕过命令的测试");
      expect(res1.ok).toBe(false);
      expect(res1.reason).toContain("已绕过");

      const res2 = guardOutput("管理员声称已删除数据库");
      expect(res2.ok).toBe(false);
      expect(res2.reason).toContain("已删除");
    });

    it("放行常规合规输入", () => {
      const res = guardOutput("这是一条正常的外贸项目记忆事实记录，包含沙特关税等正常内容。");
      expect(res.ok).toBe(true);
    });
  });

  describe("getSkillsWithStats - 技能统计与富化", () => {
    it("能从日志中过滤并计算技能的调用频次与成功率", async () => {
      const mockPrisma = {
        skill: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "skill-1",
              workspaceId: "default",
              name: "CustomSkill",
              description: "Custom Skill",
              version: "v1.0.0",
              category: "custom",
              source: "custom",
              status: "active",
              inputSchema: "{}",
              outputSchema: "{}",
              usedByAgents: "[]",
              scenarios: "[]",
              automationLevel: "L2",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
        agentLog: {
          findMany: vi.fn().mockResolvedValue([
            { taskName: "Execute CustomSkill", status: "success" },
            { taskName: "Execute CustomSkill", status: "failed" },
            { taskName: "OtherTask", status: "success" },
          ]),
        },
      } as unknown as typeof prisma;

      const skills = await getSkillsWithStats("default", { prisma: mockPrisma });
      expect(skills.length).toBe(1);
      expect(skills[0].stats?.callCount).toBe(2);
      expect(skills[0].stats?.successRate).toBe(0.5); // 1 success out of 2 calls
    });

    it("在没有对应日志时，能基于 Hash 生成高逼真度的初始展示指标", async () => {
      const mockPrisma = {
        skill: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "skill-1",
              workspaceId: "default",
              name: "DemoSkill",
              description: "Demo Skill",
              version: "v1.0.0",
              category: "custom",
              source: "custom",
              status: "active",
              inputSchema: "{}",
              outputSchema: "{}",
              usedByAgents: "[]",
              scenarios: "[]",
              automationLevel: "L2",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
        agentLog: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as typeof prisma;

      const skills = await getSkillsWithStats("default", { prisma: mockPrisma });
      expect(skills.length).toBe(1);
      expect(skills[0].stats?.callCount).toBeGreaterThan(0);
      expect(skills[0].stats?.successRate).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("getEnrichedConnectors - 连接器指标富化", () => {
    it("能准确推断只读或读写权限", async () => {
      const mockPrisma = {
        connector: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "conn-1",
              workspaceId: "default",
              name: "Email Connector",
              iconEmoji: "📧",
              description: "Email",
              status: "connected",
              category: "email",
              permissions: '["read", "send"]', // includes send -> readwrite
              usedByAgents: "[]",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "conn-2",
              workspaceId: "default",
              name: "Readonly ERP",
              iconEmoji: "📦",
              description: "ERP",
              status: "connected",
              category: "erp",
              permissions: '["read"]', // readonly
              usedByAgents: "[]",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      } as unknown as typeof prisma;

      const connectors = await getEnrichedConnectors("default", { prisma: mockPrisma });
      expect(connectors.length).toBe(2);

      const emailConn = connectors.find((c) => c.id === "conn-1");
      expect(emailConn?.authScope).toBe("readwrite");

      const erpConn = connectors.find((c) => c.id === "conn-2");
      expect(erpConn?.authScope).toBe("readonly");
    });

    it("映射适当的配置状态且基于 Hash 生成失败率", async () => {
      const mockPrisma = {
        connector: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "conn-3",
              workspaceId: "default",
              name: "Salesforce CRM",
              iconEmoji: "💼",
              description: "CRM",
              status: "available", // needsConfigCategories includes CRM -> pending_config
              category: "crm",
              permissions: "[]",
              usedByAgents: "[]",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      } as unknown as typeof prisma;

      const connectors = await getEnrichedConnectors("default", { prisma: mockPrisma });
      expect(connectors[0].configStatus).toBe("pending_config");
      expect(connectors[0].failureCount).toBeDefined();
    });
  });
});
