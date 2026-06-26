/**
 * 技能域（Skills）服务端逻辑
 *
 * 职责：
 * 1. 查询当前工作空间内的技能（支持分页与 source 过滤）；
 * 2. 依据 AgentLog 对技能进行动态调用量与成功率的统计分析；
 * 3. 创建 / 更新 / 删除 / 安装 技能（注册到工作空间）；
 * 4. 避免在 API Route 中直接承载重度计算与分析逻辑，保持接口单一职责。
 *
 * 注：技能"测试运行"的执行逻辑位于 packages/openclaw-adapter（Execution Runtime 域）。
 */
import { prisma } from "@/lib/prisma";
import { isErrorStatus } from "@/lib/server/harness-eval";
import { serializeSkill } from "@/lib/api-utils";
import type { Skill } from "@/types";

export interface SkillsDeps {
  prisma: typeof prisma;
}

const defaultDeps: SkillsDeps = {
  prisma,
};

/** 分页查询参数 */
export interface SkillsQueryParams {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  source?: string; // BUILTIN | CUSTOM | EXTERNAL
}

/**
 * 获取技能列表（支持分页与 source 过滤）
 */
export async function getSkillsWithStats(
  workspaceId: string,
  deps: SkillsDeps = defaultDeps,
): Promise<Skill[]> {
  const res = await querySkills({ workspaceId }, deps);
  return res.skills;
}

/** 带分页/过滤的技能查询 */
export async function querySkills(
  params: SkillsQueryParams,
  deps: SkillsDeps = defaultDeps,
): Promise<{ skills: Skill[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const where: any = {
    workspaceId: params.workspaceId,
    status: { not: "inactive" },
  };
  if (params.source && ["BUILTIN", "CUSTOM", "EXTERNAL"].includes(params.source)) {
    where.source = params.source;
  }

  const [skills, total] = await Promise.all([
    deps.prisma.skill.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    deps.prisma.skill.count({ where }),
  ]);

  // 限制日志拉取数量（take: 200），防止在大日志集下内存与 CPU 爆满
  const logs = await deps.prisma.agentLog.findMany({
    where: { workspaceId: params.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { taskName: true, status: true },
  });

  const enriched = skills.map((s) => {
    const serialized = serializeSkill(s as unknown as Record<string, unknown>);
    const matchedLogs = logs.filter((l) => l.taskName.includes(s.name));
    const callCount = matchedLogs.length;
    const successCount = matchedLogs.filter((l) => !isErrorStatus(l.status)).length;

    const finalCallCount = callCount;
    const finalSuccessRate = callCount > 0 ? successCount / callCount : 0.0;

    return {
      ...serialized,
      stats: {
        callCount: finalCallCount,
        successRate: Math.round(finalSuccessRate * 100) / 100,
      },
    };
  });

  return { skills: enriched, total, page, pageSize };
}

/**
 * 按 ID 查找单个技能
 */
export async function getSkillById(
  skillId: string,
  deps: SkillsDeps = defaultDeps,
) {
  return deps.prisma.skill.findUnique({ where: { id: skillId } });
}

/** 创建技能输入 */
export interface CreateSkillInput {
  workspaceId: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  source?: string;
  inputSchema?: string;
  outputSchema?: string;
  scenarios?: string;
  automationLevel?: string;
  skillMdContent?: string;
  zipPath?: string;
  isValid?: boolean;
}

/** 更新技能输入 */
export interface UpdateSkillInput {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  category?: string;
  source?: string;
  inputSchema?: string;
  outputSchema?: string;
  scenarios?: string;
  automationLevel?: string;
  skillMdContent?: string;
  zipPath?: string;
  isValid?: boolean;
  status?: string;
}

/**
 * 在工作空间内创建一条 Skill 记录。
 */
export async function createSkillRecord(
  input: CreateSkillInput,
  deps: SkillsDeps = defaultDeps,
) {
  const skillId = crypto.randomUUID();
  const skill = await deps.prisma.skill.create({
    data: {
      id: skillId,
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      version: input.version ?? "v1.0.0",
      category: input.category ?? "custom:通用",
      source: (input.source ?? "CUSTOM") as "BUILTIN" | "CUSTOM" | "EXTERNAL",
      status: "active",
      inputSchema: input.inputSchema ?? JSON.stringify({ role: input.name }),
      outputSchema: input.outputSchema ?? JSON.stringify({}),
      usedByAgents: "[]",
      scenarios: input.scenarios ?? "[]",
      automationLevel: input.automationLevel ?? "L2",
      skillMdContent: input.skillMdContent ?? null,
      zipPath: input.zipPath ?? null,
      isValid: input.isValid ?? true,
    },
  });
  return skill;
}

/**
 * 更新技能记录
 */
export async function updateSkillRecord(
  skillId: string,
  input: UpdateSkillInput,
  deps: SkillsDeps = defaultDeps,
) {
  const data: Record<string, unknown> = {};
  for (const key of [
    "name", "description", "version", "category", "source",
    "inputSchema", "outputSchema", "scenarios", "automationLevel",
    "skillMdContent", "zipPath", "isValid", "status",
  ] as const) {
    if (input[key] !== undefined) {
      data[key] = input[key];
    }
  }
  const skill = await deps.prisma.skill.update({
    where: { id: skillId },
    data,
  });
  return skill;
}

/**
 * 软删除技能（status → inactive），若被 Agent 引用则拒绝
 */
export async function deleteSkillRecord(
  skillId: string,
  force = false,
  deps: SkillsDeps = defaultDeps,
) {
  const skill = await deps.prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) throw new Error("技能不存在");

  if (!force) {
    const usedBy = (() => {
      try { return JSON.parse(skill.usedByAgents) as string[]; } catch { return []; }
    })();
    if (usedBy.length > 0) {
      throw new Error(`技能正在被 ${usedBy.length} 个智能体使用，请先解除绑定`);
    }
  }

  return deps.prisma.skill.update({
    where: { id: skillId },
    data: { status: "inactive" },
  });
}

/**
 * 为执行域加载技能（薄门卫读 DB → 调 executor）。
 */
export async function loadSkillForExecution(
  skillId: string,
  deps: SkillsDeps = defaultDeps,
) {
  return deps.prisma.skill.findUnique({ where: { id: skillId } });
}
