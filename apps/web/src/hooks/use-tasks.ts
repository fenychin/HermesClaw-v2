"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { buildUrl, type QueryParams } from "@/hooks/use-query-factory"

// ==============================
// 类型定义
// ==============================

/** 任务状态 */
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"
/** 任务优先级 */
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"
/** 任务来源 */
export type TaskSource = "intelligence" | "manual" | "inquiry"

/** 任务列表项（API 序列化后 Date 字段为 ISO 字符串） */
export interface TaskItem {
  id: string
  workspaceId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  source: TaskSource | null
  relatedType: string | null
  relatedId: string | null
  dueAt: string | null
  createdAt: string
  updatedAt: string
}

/** 任务列表 API 响应 */
interface TaskListResponse {
  tasks: TaskItem[]
}

/** 任务筛选参数 */
export interface TaskFilters {
  status?: TaskStatus
  priority?: TaskPriority
  source?: TaskSource
}

/** 创建任务输入 */
export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  source?: TaskSource
  relatedType?: string
  relatedId?: string
  dueAt?: string
}

/** 更新任务输入 */
export interface UpdateTaskInput {
  id: string
  status?: TaskStatus
  priority?: TaskPriority
}

// ==============================
// API 调用
// ==============================

/** 获取任务列表 */
async function fetchTasks(filters?: TaskFilters): Promise<TaskItem[]> {
  const params: QueryParams = {}
  if (filters?.status) params.status = filters.status
  if (filters?.priority) params.priority = filters.priority
  if (filters?.source) params.source = filters.source

  const url = buildUrl("/api/tasks", Object.keys(params).length > 0 ? params : undefined)
  const res = await fetch(url)
  if (!res.ok) throw new Error("获取任务列表失败")
  const json = await res.json() as TaskListResponse & { success: boolean; error?: string }
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.tasks
}

/** 创建任务 */
async function createTask(input: CreateTaskInput): Promise<TaskItem> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error("创建任务失败")
  const json = await res.json() as { success: boolean; data: TaskItem; error?: string }
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

/** 更新任务 */
async function updateTask(input: UpdateTaskInput): Promise<TaskItem> {
  const { id, ...body } = input
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("更新任务失败")
  const json = await res.json() as { success: boolean; data: TaskItem; error?: string }
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

/** 取消任务（软删除） */
async function cancelTask(id: string): Promise<TaskItem> {
  const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("取消任务失败")
  const json = await res.json() as { success: boolean; data: TaskItem; error?: string }
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

// ==============================
// TanStack Query Hooks
// ==============================

/** 任务列表 queryKey 前缀 */
const TASKS_KEY = ["tasks"] as const

/**
 * 任务列表 Hook
 * —— queryKey: ['tasks', workspaceId, filters]，staleTime: 30s
 */
export function useTasks(filters?: TaskFilters, workspaceId = "default") {
  const { data, isLoading, error } = useQuery({
    queryKey: [...TASKS_KEY, workspaceId, filters ?? {}],
    queryFn: () => fetchTasks(filters),
    staleTime: 30_000,
  })

  return {
    tasks: data ?? [],
    isLoading,
    error,
  }
}

/**
 * 创建任务 Mutation Hook
 * —— 成功后自动刷新任务列表缓存
 */
export function useCreateTask(workspaceId = "default") {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...TASKS_KEY, workspaceId] })
    },
  })
}

/**
 * 更新任务 Mutation Hook
 * —— 乐观更新：立即更新缓存中的任务状态
 */
export function useUpdateTask(workspaceId = "default") {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...TASKS_KEY, workspaceId] })
    },
  })
}

/**
 * 取消任务 Mutation Hook
 * —— 成功后自动刷新任务列表
 */
export function useCancelTask(workspaceId = "default") {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cancelTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...TASKS_KEY, workspaceId] })
    },
  })
}
