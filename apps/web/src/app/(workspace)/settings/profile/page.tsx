"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MessageSquare, Upload, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface ConnectedAccount {
  connected: boolean;
  username: string;
  connectedAt?: string;
}

interface ProfileState {
  twitter: ConnectedAccount;
  discord: ConnectedAccount;
}

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileState>({
    twitter: { connected: false, username: "" },
    discord: { connected: false, username: "" },
  });

  // 二次确认对话框状态
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetDisconnect, setTargetDisconnect] = useState<"twitter" | "discord" | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // 头像状态
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // 1. 初始化拉取数据
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/settings/profile");
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (err) {
        toast.error("拉取个人资料失败");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
    if (session?.user?.image) {
      setAvatarUrl(session.user.image);
    }
  }, [session]);

  // 2. 连接第三方账户
  const handleConnect = async (platform: "twitter" | "discord") => {
    toast.info(`正在前往 ${platform === "twitter" ? "X (Twitter)" : "Discord"} 授权页面...`);
    // 模拟 1.5 秒后绑定成功
    setTimeout(() => {
      setProfile((prev) => ({
        ...prev,
        [platform]: {
          connected: true,
          username: platform === "twitter" ? "@HermesAgent" : "HermesClawDev#8888",
          connectedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
        },
      }));
      toast.success(`${platform === "twitter" ? "X (Twitter)" : "Discord"} 绑定成功`);
    }, 1500);
  };

  // 3. 断开连接流程 (弹出 Dialog 确认)
  const triggerDisconnect = (platform: "twitter" | "discord") => {
    setTargetDisconnect(platform);
    setConfirmOpen(true);
  };

  const handleDisconnectConfirm = async () => {
    if (!targetDisconnect) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", platform: targetDisconnect }),
      });
      if (res.ok) {
        setProfile((prev) => ({
          ...prev,
          [targetDisconnect]: { connected: false, username: "" },
        }));
        toast.success(`已成功断开与 ${targetDisconnect === "twitter" ? "X (Twitter)" : "Discord"} 的连接`);
      } else {
        throw new Error();
      }
    } catch {
      toast.error("断开连接失败");
    } finally {
      setDisconnecting(false);
      setConfirmOpen(false);
      setTargetDisconnect(null);
    }
  };

  // 4. 头像上传模拟 (裁剪至 1:1)
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 格式及大小校验
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("仅支持 JPG 或 PNG 格式图片");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      // 模拟上传
      setTimeout(() => {
        setAvatarUrl(reader.result as string);
        setUploading(false);
        toast.success("头像上传并裁剪成功（1:1）");
      }, 1200);
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="space-y-8 select-none font-sans">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28 bg-[#262626]" />
          <Skeleton className="h-4 w-72 bg-[#262626]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-28 w-full bg-[#111111] rounded-[16px]" />
          <Skeleton className="h-40 w-full bg-[#111111] rounded-[16px]" />
          <Skeleton className="h-36 w-full bg-[#111111] rounded-[16px]" />
        </div>
      </div>
    );
  }

  const userEmail = session?.user?.email || "guest@hermesclaw.ai";

  return (
    <div className="space-y-8 font-sans">
      {/* 标题 */}
      <div className="space-y-1.5 border-b border-[#262626] pb-5 select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold">个人资料</div>
        <p className="text-[#B3B3B3] text-sm">
          个性化设置他人在 HermesClaw 上如何查看与你互动
        </p>
      </div>

      {/* 区块 1: 头像 */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="text-[#F5F5F5] text-sm font-semibold select-none">个人头像</div>
        <div className="flex items-center gap-5">
          <div className="size-16 rounded-full bg-[#171717] border border-[#262626] flex items-center justify-center overflow-hidden shrink-0 relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
            ) : (
              <span className="text-[#B3B3B3] text-lg font-bold">
                {userEmail.charAt(0).toUpperCase()}
              </span>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-[#050505]/70 flex items-center justify-center">
                <Loader2 className="size-4 animate-spin text-[#6D5EF9]" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="h-9 px-3.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white border border-[#262626] rounded-[12px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors select-none">
                <Upload className="size-3.5" />
                上传头像
                <input
                  type="file"
                  accept="image/png, image/jpeg"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            <p className="text-[#B3B3B3] text-[10px] select-none">
              仅支持 JPG, PNG。建议尺寸 1:1，大小不超过 2MB。
            </p>
          </div>
        </div>
      </div>

      {/* 区块 2: 邮箱 */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="text-[#F5F5F5] text-sm font-semibold select-none">账号邮箱</div>
        <div className="flex gap-3 max-w-md">
          <div className="flex-1">
            <Input
              type="email"
              value={userEmail}
              readOnly
              className="bg-transparent border-[#262626] text-[#B3B3B3] h-10 select-all cursor-not-allowed focus-visible:ring-0 focus-visible:border-[#262626]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 rounded-[12px] bg-[#1F1F1F] hover:bg-[#2A2A2A] text-white border border-[#262626]"
            onClick={() => toast.info("更改邮箱功能需联系系统管理员")}
          >
            更改邮箱
          </Button>
        </div>
      </div>

      {/* 区块 3: 已连接账号 */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="text-[#F5F5F5] text-sm font-semibold select-none">已连接的第三方账户</div>
        <div className="space-y-3.5">
          {/* X (Twitter) 行 */}
          <div className="flex items-center justify-between p-3.5 bg-[#171717] border border-[#262626] rounded-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#262626] text-[#F5F5F5] shrink-0 border border-[#333333]">
                <TwitterIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[#F5F5F5] text-sm font-semibold">X (Twitter)</div>
                <div className="text-xs text-[#B3B3B3] mt-0.5 truncate max-w-[200px] select-all">
                  {profile.twitter.connected
                    ? `${profile.twitter.username} (连接于 ${profile.twitter.connectedAt})`
                    : "未连接"}
                </div>
              </div>
            </div>
            <div>
              {profile.twitter.connected ? (
                <Button
                  variant="destructive"
                  className="h-8 rounded-[12px] px-3 text-xs"
                  onClick={() => triggerDisconnect("twitter")}
                >
                  断开
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-8 rounded-[12px] px-3 text-xs border-[#262626] bg-[#1F1F1F] text-white hover:bg-[#2A2A2A]"
                  onClick={() => handleConnect("twitter")}
                >
                  连接
                </Button>
              )}
            </div>
          </div>

          {/* Discord 行 */}
          <div className="flex items-center justify-between p-3.5 bg-[#171717] border border-[#262626] rounded-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#262626] text-[#F5F5F5] shrink-0 border border-[#333333]">
                <MessageSquare className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[#F5F5F5] text-sm font-semibold">Discord</div>
                <div className="text-xs text-[#B3B3B3] mt-0.5 truncate max-w-[200px] select-all">
                  {profile.discord.connected
                    ? `${profile.discord.username} (连接于 ${profile.discord.connectedAt})`
                    : "未连接"}
                </div>
              </div>
            </div>
            <div>
              {profile.discord.connected ? (
                <Button
                  variant="destructive"
                  className="h-8 rounded-[12px] px-3 text-xs"
                  onClick={() => triggerDisconnect("discord")}
                >
                  断开
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-8 rounded-[12px] px-3 text-xs border-[#262626] bg-[#1F1F1F] text-white hover:bg-[#2A2A2A]"
                  onClick={() => handleConnect("discord")}
                >
                  连接
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 危险操作二次确认 Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-[#EF4444] text-base font-bold">
              断开三方账户连接？
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed pt-1.5">
              您确定要断开与 {targetDisconnect === "twitter" ? "X (Twitter)" : "Discord"} 的关联吗？断开后智能体将暂时无法通过该平台采集您的互动上下文。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                  disabled={disconnecting}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              className="h-9 rounded-[12px] text-xs bg-[#EF4444] hover:bg-[#EF4444]/90 text-white flex items-center gap-1"
              onClick={handleDisconnectConfirm}
              disabled={disconnecting}
            >
              {disconnecting && <RefreshCw className="size-3 animate-spin" />}
              断开连接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
