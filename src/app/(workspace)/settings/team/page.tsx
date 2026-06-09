"use client";

import { useState, useCallback } from "react";
import {
  useWorkspaceMembers,
  useInviteMember,
  useChangeMemberRole,
  useRemoveMember,
  type WorkspaceMember,
} from "@/hooks/use-workspace";
import type { WorkspaceRole } from "@/lib/workspace";
import { WORKSPACE_ROLES, isAdmin } from "@/lib/workspace";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ==============================
// 角色 Badge 样式
// ==============================

const ROLE_BADGE_CONFIG: Record<WorkspaceRole, { variant: "default" | "secondary" | "destructive" | "outline"; label: string; className?: string }> = {
  OWNER: { variant: "default", label: "拥有者" },
  ADMIN: { variant: "secondary", label: "管理员" },
  MEMBER: { variant: "outline", label: "成员" },
  VIEWER: { variant: "outline", label: "观察者" },
};

const ROLE_BADGE_COLORS: Record<WorkspaceRole, string> = {
  OWNER: "bg-primary text-primary-foreground",
  ADMIN: "bg-brand-blue/20 text-brand-blue border-brand-blue/30",
  MEMBER: "bg-success/20 text-success border-success/30",
  VIEWER: "bg-muted text-muted-foreground",
};

function RoleBadge({ role }: { role: WorkspaceRole }) {
  const config = ROLE_BADGE_CONFIG[role];
  return (
    <Badge
      variant={config.variant}
      className={cn("text-xs font-medium", ROLE_BADGE_COLORS[role])}
    >
      {config.label}
    </Badge>
  );
}

// ==============================
// 角色选择器
// ==============================

const ROLE_OPTIONS: { value: WorkspaceRole; label: string }[] = [
  { value: "ADMIN", label: "管理员" },
  { value: "MEMBER", label: "成员" },
  { value: "VIEWER", label: "观察者" },
];

// ==============================
// 邀请成员 Dialog
// ==============================

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("MEMBER");
  const inviteMutation = useInviteMember();

  const handleInvite = useCallback(async () => {
    if (!email.trim()) return;
    try {
      await inviteMutation.mutateAsync({ email: email.trim(), role });
      toast.success(`已邀请 ${email}`);
      setEmail("");
      setRole("MEMBER");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "邀请失败");
    }
  }, [email, role, inviteMutation, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>邀请成员</DialogTitle>
          <DialogDescription>
            输入已注册用户的邮箱地址，选择角色后发送邀请
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">邮箱地址</label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceRole)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter showCloseButton>
          <Button
            onClick={handleInvite}
            disabled={!email.trim() || inviteMutation.isPending}
          >
            {inviteMutation.isPending ? "邀请中…" : "发送邀请"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==============================
// 角色变更确认 Dialog
// ==============================

function ChangeRoleDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: WorkspaceMember | null;
}) {
  const [newRole, setNewRole] = useState<WorkspaceRole>("MEMBER");
  const changeMutation = useChangeMemberRole();

  const handleChange = useCallback(async () => {
    if (!member) return;
    try {
      await changeMutation.mutateAsync({ userId: member.userId, role: newRole });
      toast.success(`${member.name} 角色已变更为 ${ROLE_BADGE_CONFIG[newRole].label}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "变更失败");
    }
  }, [member, newRole, changeMutation, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>变更角色</DialogTitle>
          <DialogDescription>
            {member?.name} — 当前角色：{member ? ROLE_BADGE_CONFIG[member.role].label : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">新角色</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as WorkspaceRole)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={handleChange} disabled={changeMutation.isPending}>
            {changeMutation.isPending ? "变更中…" : "确认变更"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==============================
// 移除成员确认 Dialog
// ==============================

function RemoveMemberDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: WorkspaceMember | null;
}) {
  const removeMutation = useRemoveMember();

  const handleRemove = useCallback(async () => {
    if (!member) return;
    try {
      await removeMutation.mutateAsync(member.userId);
      toast.success(`已移除 ${member.name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    }
  }, [member, removeMutation, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>移除成员</DialogTitle>
          <DialogDescription>
            确定要移除 <span className="text-foreground font-medium">{member?.name}</span> 吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={removeMutation.isPending}
          >
            {removeMutation.isPending ? "移除中…" : "确认移除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==============================
// 成员列表加载骨架屏
// ==============================

function MembersSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ==============================
// 主页面
// ==============================

export default function TeamPage() {
  const { members, workspace, isLoading } = useWorkspaceMembers();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [changeRoleTarget, setChangeRoleTarget] = useState<WorkspaceMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null);

  // 当前用户的角色——从 session API 推断（members 列表中第一个匹配当前登录用户）
  // 简化处理：首版假设当前用户为第一个 OWNER 或 ADMIN
  const currentRole: WorkspaceRole = members.length > 0
    ? (members[0].role as WorkspaceRole)
    : "VIEWER";
  const canManage = isAdmin(currentRole);

  return (
    <div className="p-6 h-full flex flex-col">
      <PageHeader
        title="团队与权限"
        description="管理工作空间成员、角色与访问控制"
        breadcrumb={[
          { label: "设置", href: "/settings" },
          { label: "团队与权限" },
        ]}
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)} size="sm">
              <UserPlus className="size-4 mr-1.5" />
              邀请成员
            </Button>
          ) : undefined
        }
      />

      {/* 工作空间信息卡片 */}
      {workspace && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-card rounded-2xl border border-border">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-foreground font-semibold text-sm truncate">{workspace.name}</h2>
            <p className="text-xs text-muted-foreground">
              计划：{workspace.plan === "free" ? "免费版" : workspace.plan === "pro" ? "专业版" : "企业版"}
              {" · "}
              {members.length} 位成员
            </p>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            我的角色：{ROLE_BADGE_CONFIG[currentRole].label}
          </Badge>
        </div>
      )}

      {/* 成员列表 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <MembersSkeleton />
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Users className="size-12 mb-3 text-hint" />
            <p className="text-sm">暂无成员</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>成员</TableHead>
                  <TableHead>角色</TableHead>
                  {canManage && <TableHead className="w-16 text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-muted-foreground shrink-0">
                        {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {member.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={member.role} />
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {/* OWNER 不可操作，当前用户自身不可操作 */}
                        {member.role !== "OWNER" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setChangeRoleTarget(member)}>
                                <Shield className="size-4 mr-2" />
                                变更角色
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-danger"
                                onClick={() => setRemoveTarget(member)}
                              >
                                <Trash2 className="size-4 mr-2" />
                                移除成员
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ChangeRoleDialog
        open={!!changeRoleTarget}
        onOpenChange={(open) => { if (!open) setChangeRoleTarget(null); }}
        member={changeRoleTarget}
      />
      <RemoveMemberDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        member={removeTarget}
      />
    </div>
  );
}
