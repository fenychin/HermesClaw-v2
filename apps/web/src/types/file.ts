/**
 * 文件管理领域类型
 * —— 对应 PRD 10.7 文件：企业内容供给链
 * —— Phase 2 追踪链路升级：新增 sourceType / taskId / workflowRunId / receiptHash / connectorId
 */

/** 文件分类 */
export type FileCategory =
  | "all"
  | "customer"
  | "product"
  | "quotation"
  | "contract"
  | "image"
  | "video"
  | "audio"
  | "archive"

/** Artifact 数据库分类 */
export type ArtifactCategory = "document" | "image" | "audio" | "video" | "archive" | "other"

/** 文件来源类型 */
export type FileSourceType = "artifact" | "user_upload"

/** 文件解析状态 */
export type FileParseStatus = "parsed" | "parsing" | "unparsed" | "failed"

/** 向量索引状态 */
export type VectorIndexStatus = "indexed" | "unindexed"

/** 文件版本记录 */
export interface FileVersion {
  id: string
  fileName: string
  /** 文件大小（字节） */
  size: number
  operator: string
  createdAt: string
  note?: string
}

/** 文件实体 */
export interface FileItem {
  id: string
  /** 文件名 */
  name: string
  /** 文件类型（扩展名不含点） */
  type: string
  /** 分类 */
  category: FileCategory
  /** 文件大小（字节），展示时用 Intl.NumberFormat 格式化 */
  size: number

  // —— Phase 2 追踪链路字段 ——
  /** 文件来源类型：AI 生成物 / 用户上传 */
  sourceType: FileSourceType
  /** 关联任务 ID（AI 生成物时非空） */
  taskId: string | null
  /** 关联工作流运行 ID */
  workflowRunId: string | null
  /** 执行证据 hash（对应 ActionReceipt.receiptId，仅 AI 生成物） */
  receiptHash: string | null
  /** 产生此文件的连接器 ID */
  connectorId: string | null

  /** 关联项目 ID */
  relatedProjectId?: string
  /** 关联项目名称 */
  relatedProjectName?: string
  /** 关联智能体 ID 列表 */
  relatedAgentIds: string[]
  /** 解析状态 */
  parseStatus: FileParseStatus
  /** 向量索引状态 */
  vectorIndexStatus: VectorIndexStatus
  /** 解析摘要（已解析时显示） */
  parseSummary?: string
  /** 标签 */
  tags: string[]
  /** 版本历史 */
  versions: FileVersion[]
  /** 更新时间 */
  updatedAt: string
  /** 创建时间 */
  createdAt: string
  /** 操作者 */
  operatedBy: string
}
