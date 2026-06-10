"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceRole } from "@/lib/workspace-roles";

// ==============================
// 类型定义
// ==============================

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export interface WorkspaceData {
  workspace: WorkspaceInfo;
  members: WorkspaceMember[];
}

// ==============================
// API 调用
// ==============================

async function fetchWorkspaceData(): Promise<WorkspaceData> {
  const res = await fetch("/api/workspace/members");
  if (!res.ok) throw new Error("获取成员列表失败");
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "未知错误");
  return json.data as WorkspaceData;
}

async function inviteMember(email: string, role: string) {
  const res = await fetch("/api/workspace/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "邀请失败");
  return json.data;
}

async function changeMemberRole(userId: string, role: string) {
  const res = await fetch("/api/workspace/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "变更角色失败");
  return json.data;
}

async function removeMember(userId: string) {
  const res = await fetch(`/api/workspace/members?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "移除成员失败");
  return json.data;
}

// ==============================
// TanStack Query Hooks
// ==============================

/**
 * 统一的 workspace 数据 Hook
 * —— 合并 useCurrentWorkspace / useWorkspaceMembers / useWorkspaceRole 三个查询
 *    共享同一 queryKey 与 queryFn，由 React Query 自动去重
 */
export function useWorkspaceData() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspaceData,
    staleTime: 60_000,
  });
  return {
    workspace: data?.workspace ?? null,
    members: data?.members ?? [],
    isLoading,
    error,
  };
}

/** 邀请成员 mutation */
export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      inviteMember(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

/** 变更角色 mutation */
export function useChangeMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      changeMemberRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

/** 移除成员 mutation */
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}
