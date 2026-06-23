/**
 * Nebula Graph — 前端渲染用类型（Phase 4）
 *
 * 三域原则：这些类型仅用于前端渲染与交互，
 * 不包含任何图谱语义计算逻辑（由服务端完成）。
 */
import type { GraphNode, GraphEdge } from "@hermesclaw/event-contracts"

export type { GraphNode, GraphEdge }

/** 力导向布局中的 3D 位置 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** 2D 位置（降级模式） */
export interface Vec2 {
  x: number
  y: number
}

/** 布局后的节点（携带位置） */
export interface LayoutNode extends GraphNode {
  /** 3D 位置（worker 计算产出） */
  position: Vec3
  /** 2D 投影（用于 D3 降级） */
  position2d: Vec2
  /** 速度（力导向迭代用） */
  velocity: Vec3
}

/** 布局后的边（携带源/目标索引） */
export interface LayoutEdge {
  id: string
  source: string
  target: string
  sourceIndex: number
  targetIndex: number
  relation: string
  weight: number
}

/** 布局计算结果（worker → 主线程） */
export interface ForceLayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  iterations: number
  energy: number
  computeTimeMs: number
}

/** 图谱渲染模式 */
export type RenderMode = "three-3d" | "d3-2d"

/** 性能度量 */
export interface RenderPerf {
  fps: number
  frameTimeMs: number
  renderMode: RenderMode
  nodeCount: number
  edgeCount: number
  /** 是否已自动降级 */
  degraded: boolean
  /** 降级原因 */
  degradeReason?: string
}

/** 选中的节点详情 */
export interface SelectedNodeDetail {
  node: GraphNode
  /** 关联的边 */
  relatedEdges: Array<{ edge: LayoutEdge; otherNode: GraphNode }>
  /** 最近事件摘要（由服务端提供或从 signal feed 派生） */
  recentEvents: Array<{
    title: string
    timestamp: string
    threatLevel?: string
  }>
}

/** 节点→沙盘联动结构化输入（非自然语言拼接） */
export interface NodeToSandboxContext {
  /** 触发来源：节点 ID */
  sourceNodeId: string
  /** 节点类型 */
  nodeType: string
  /** 节点标签 */
  nodeLabel: string
  /** 节点类别 */
  nodeCategory: string
  /** 预构建场景描述（结构化字段） */
  scenarioContext: {
    /** 主体实体 */
    entity: string
    /** 作用域 */
    domain: string
    /** 已观察到的信号（来自节点关联事件） */
    observedSignals: string[]
  }
  /** 建议的假设条件 */
  suggestedHypothesis: string
  /** 建议的时间范围 */
  suggestedTimeHorizon: string
  /** 关联节点标签列表 */
  relatedNodeLabels: string[]
}

/** 图谱差分更新（从 intel.topology.updated 事件解析） */
export interface GraphDiff {
  added: GraphNode[]
  removed: string[]
  updated: GraphEdge[]
}

/** Worker 消息类型 */
export interface LayoutWorkerMessage {
  type: "layout"
  nodes: Array<{ id: string; weight?: number; category?: string }>
  edges: Array<{ id: string; source: string; target: string; weight?: number }>
  options?: {
    width?: number
    height?: number
    depth?: number
    iterations?: number
  }
}

export interface LayoutWorkerResponse {
  type: "layout-result"
  result: ForceLayoutResult
}

export type WorkerMessage = LayoutWorkerMessage
export type WorkerResponse = LayoutWorkerResponse
