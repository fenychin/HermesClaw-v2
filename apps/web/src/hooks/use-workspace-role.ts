"use client"

import { useSession } from "next-auth/react"
import { useWorkspaceData } from "@/hooks/use-workspace"
import type { WorkspaceRole } from "@/lib/workspace-roles"

/**
 * 当前用户在当前工作空间中的角色 Hook
 * —— 组合 useSession + useWorkspaceData，消除重复的 members.find() 模式
 * —— 返回 role 及常用判定布尔值
 */
export function useCurrentWorkspaceRole() {
  const { data: session } = useSession()
  const { members, isLoading } = useWorkspaceData()

  const currentMember = members.find(
    (m) => m.email === session?.user?.email,
  )

  const role: WorkspaceRole = currentMember?.role ?? "VIEWER"

  return {
    role,
    isLoading,
    isViewer: role === "VIEWER",
    isMember: role === "MEMBER" || role === "ADMIN" || role === "OWNER",
    isAdmin: role === "ADMIN" || role === "OWNER",
    isOwner: role === "OWNER",
    /** 是否可执行写操作（非 VIEWER） */
    canWrite: role !== "VIEWER",
    /** 是否可审批 L3 动作（至少 MEMBER） */
    canApproveL3: role !== "VIEWER",
  }
}
