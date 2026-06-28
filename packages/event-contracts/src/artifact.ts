import { z } from "zod"
import {
  IdSchema,
  TimestampSchema,
  VersionSchema,
  PayloadSchema,
} from "./shared"

/**
 * Artifact —— 文件/产物存储契约（OpenClaw Runtime 职责层）。
 *
 * 依据 CLAUDE.md §5：所有执行动作必须携带 taskId / workflowRunId / receipt。
 * Artifact 是 OpenClaw 执行产物的持久化证据，可关联 ActionReceipt 形成完整证据链。
 */

/** Artifact 契约版本 */
export const ARTIFACT_VERSION = "1.0.0"

/** 文件来源类型 */
export const ArtifactSourceTypeSchema = z.enum(["artifact", "user_upload"])
export type ArtifactSourceType = z.infer<typeof ArtifactSourceTypeSchema>

/** 文件分类 */
export const ArtifactCategorySchema = z.enum([
  "document",
  "image",
  "audio",
  "video",
  "archive",
  "other",
])
export type ArtifactCategory = z.infer<typeof ArtifactCategorySchema>

/** 解析状态 */
export const ArtifactParseStatusSchema = z.enum([
  "unparsed",
  "parsing",
  "parsed",
  "failed",
])
export type ArtifactParseStatus = z.infer<typeof ArtifactParseStatusSchema>

/**
 * ArtifactRecord —— 文件/产物完整追踪记录。
 *
 * 映射到 Prisma Artifact 模型，承载：
 * - 文件基本信息（name / size / mimeType / url）
 * - 来源追踪（sourceType / taskId / workflowRunId / receiptHash / connectorId）
 * - 解析状态（parseStatus / parseSummary / vectorIndexed）
 */
export const ArtifactRecordSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,

  /** 展示文件名 */
  fileName: z.string().min(1),
  /** 原始文件名 */
  originalName: z.string().min(1),
  /** MIME 类型 */
  mimeType: z.string(),
  /** 文件大小（字节） */
  size: z.number().int().min(0),
  /** 文件存储路径/URL */
  url: z.string(),

  /** 文件分类 */
  category: ArtifactCategorySchema,
  /** 来源类型：AI 生成物 / 用户上传 */
  sourceType: ArtifactSourceTypeSchema,

  /** 关联 task（AI 生成物时非空） */
  taskId: z.string().nullable(),
  /** 关联 workflow run */
  workflowRunId: z.string().nullable(),
  /** 执行证据 hash（对应 ActionReceipt.receiptId） */
  receiptHash: z.string().nullable(),
  /** 产生此文件的连接器 ID */
  connectorId: z.string().nullable(),

  /** 解析状态 */
  parseStatus: ArtifactParseStatusSchema,
  /** 解析摘要（文本） */
  parseSummary: z.string().nullable(),
  /** 是否已建立向量索引 */
  vectorIndexed: z.boolean(),

  /** 标签 */
  tags: z.array(z.string()),
  /** 扩展元数据 */
  metadata: PayloadSchema.nullable(),

  /** 操作者 */
  operatedBy: z.string(),

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  /** 契约版本 */
  version: VersionSchema,
})

export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>

/**
 * 文件列表查询参数 schema。
 */
export const ArtifactQuerySchema = z.object({
  workspaceId: IdSchema,
  /** 分类过滤：document / image / audio / video / archive */
  category: ArtifactCategorySchema.optional(),
  /** 来源过滤 */
  sourceType: ArtifactSourceTypeSchema.optional(),
  /** 按 taskId 过滤 */
  taskId: z.string().optional(),
  /** 搜索关键词（匹配 fileName / tags） */
  search: z.string().optional(),
  /** 分页 */
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ArtifactQuery = z.infer<typeof ArtifactQuerySchema>

/**
 * 创建 Artifact 的输入 schema（用于上传/ Agent 生成文件时写入）。
 */
export const CreateArtifactSchema = z.object({
  workspaceId: IdSchema,
  fileName: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().min(0),
  url: z.string(),
  category: ArtifactCategorySchema.optional(),
  sourceType: ArtifactSourceTypeSchema,
  taskId: z.string().optional().nullable(),
  workflowRunId: z.string().optional().nullable(),
  receiptHash: z.string().optional().nullable(),
  connectorId: z.string().optional().nullable(),
  metadata: PayloadSchema.optional().nullable(),
  operatedBy: z.string().optional(),
})

export type CreateArtifact = z.infer<typeof CreateArtifactSchema>

/**
 * 判断文件来源是否可追踪（有 taskId 或 receiptHash 至少一个）。
 */
export function isArtifactTraceable(artifact: ArtifactRecord): boolean {
  return artifact.taskId !== null || artifact.receiptHash !== null
}

/**
 * 从 ArtifactRecord 生成前端展示用的 sourceType 标签。
 */
export function getArtifactSourceLabel(sourceType: ArtifactSourceType): string {
  return sourceType === "artifact" ? "AI 生成物" : "用户上传"
}
