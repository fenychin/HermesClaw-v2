"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, RefreshCw, Key, LogOut, Laptop, Smartphone, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// 密码表单验证规则
const passwordSchema = z.object({
  currentPassword: z.string().min(1, "当前密码不能为空"),
  newPassword: z.string().min(6, "新密码长度不能少于 6 位"),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "两次输入的新密码不一致",
  path: ["confirmNewPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface Device {
  id: string;
  name: string;
  ip: string;
  lastActive: string;
  current: boolean;
}

export default function SecuritySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  // 2FA Modal 状态
  const [enable2faOpen, setEnable2faOpen] = useState(false);
  const [disable2faOpen, setDisable2faOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmPasswordFor2fa, setConfirmPasswordFor2fa] = useState("");
  const [verifying2fa, setVerifying2fa] = useState(false);

  // 密码显示状态
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // 活跃设备退出确认状态
  const [deviceConfirmOpen, setDeviceConfirmOpen] = useState(false);
  const [targetDevice, setTargetDevice] = useState<Device | null>(null);
  const [logoutAllOthersOpen, setLogoutAllOthersOpen] = useState(false);
  const [deviceProcessing, setDeviceProcessing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  // 1. 初始化拉取安全状态与活跃设备
  useEffect(() => {
    async function initSecurity() {
      try {
        const res = await fetch("/api/settings/security");
        if (res.ok) {
          const data = await res.json();
          setTwoFactorEnabled(data.twoFactorEnabled);
          setDevices(data.devices);
        }
      } catch (err) {
        toast.error("加载安全配置失败");
      } finally {
        setLoading(false);
      }
    }
    initSecurity();
  }, []);

  // 2. 修改密码
  const onPasswordSubmit = async (data: PasswordFormValues) => {
    setUpdatingPassword(true);
    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", ...data }),
      });
      if (res.ok) {
        toast.success("密码已更新成功");
        reset();
      } else {
        const errData = await res.json();
        throw new Error(errData.error);
      }
    } catch (err: any) {
      toast.error(err.message || "更新密码失败，请核对当前密码");
    } finally {
      setUpdatingPassword(false);
    }
  };

  // 3. 2FA 流程
  const handleEnable2faClick = async () => {
    setVerifying2fa(true);
    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable-2fa" }),
      });
      if (res.ok) {
        const data = await res.json();
        setQrCodeUrl(data.qrCode);
        setTotpSecret(data.secret);
        setEnable2faOpen(true);
      }
    } catch {
      toast.error("启用流程初始化失败");
    } finally {
      setVerifying2fa(false);
    }
  };

  const handleConfirm2fa = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error("请输入 6 位数字验证码");
      return;
    }
    setVerifying2fa(true);
    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm-2fa", code: verificationCode }),
      });
      if (res.ok) {
        setTwoFactorEnabled(true);
        toast.success("两步验证 (2FA) 启用成功");
        setEnable2faOpen(false);
        setVerificationCode("");
      }
    } catch {
      toast.error("验证失败，请确认验证码是否过期");
    } finally {
      setVerifying2fa(false);
    }
  };

  const handleDisable2fa = async () => {
    if (!confirmPasswordFor2fa) {
      toast.error("请输入账号当前密码以进行安全校验");
      return;
    }
    setVerifying2fa(true);
    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable-2fa", password: confirmPasswordFor2fa }),
      });
      if (res.ok) {
        setTwoFactorEnabled(false);
        toast.success("已成功关闭两步验证 (2FA)");
        setDisable2faOpen(false);
        setConfirmPasswordFor2fa("");
      }
    } catch {
      toast.error("密码校验失败，请重试");
    } finally {
      setVerifying2fa(false);
    }
  };

  // 4. 设备退出流程
  const handleDeviceLogoutClick = (device: Device) => {
    setTargetDevice(device);
    setDeviceConfirmOpen(true);
  };

  const handleConfirmDeviceLogout = async () => {
    if (!targetDevice) return;
    setDeviceProcessing(true);
    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout-device", deviceId: targetDevice.id }),
      });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== targetDevice.id));
        toast.success(`已强行将设备 ${targetDevice.name} 登出`);
      }
    } catch {
      toast.error("设备登出失败");
    } finally {
      setDeviceProcessing(false);
      setDeviceConfirmOpen(false);
      setTargetDevice(null);
    }
  };

  const handleLogoutAllOthers = async () => {
    setDeviceProcessing(true);
    try {
      const res = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout-all-others" }),
      });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.current));
        toast.success("已成功强退全部其他活跃登录设备");
      }
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setDeviceProcessing(false);
      setLogoutAllOthersOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 select-none font-sans">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28 bg-[#262626]" />
          <Skeleton className="h-4 w-72 bg-[#262626]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full bg-[#111111] rounded-[16px]" />
          <Skeleton className="h-32 w-full bg-[#111111] rounded-[16px]" />
          <Skeleton className="h-44 w-full bg-[#111111] rounded-[16px]" />
        </div>
      </div>
    );
  }

  // 谷歌 Authenticator 绑定的二维码在线生成 API (使用 qrserver 做 WOW 动效)
  const dynamicQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&bgcolor=24242a&color=f5f5f5&margin=5&data=${encodeURIComponent(
    qrCodeUrl || "MOCK"
  )}`;

  return (
    <div className="space-y-8 font-sans">
      {/* 标题 */}
      <div className="space-y-1.5 border-b border-[#262626] pb-5 select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold">安全设置</div>
        <p className="text-[#B3B3B3] text-sm">
          保护您的账户凭证，配置两步验证，并审查活跃设备
        </p>
      </div>

      {/* 区块 1: 更新密码 */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="text-[#F5F5F5] text-sm font-semibold select-none flex items-center gap-1.5">
          <Key className="size-4 text-[#6D5EF9]" />
          更新密码
        </div>
        <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-md">
          {/* 当前密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#B3B3B3] text-xs font-medium">当前密码</label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                placeholder="请输入当前密码"
                {...register("currentPassword")}
                className="bg-transparent border-[#262626] text-[#F5F5F5] pr-10 focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] hover:text-[#F5F5F5]"
              >
                {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.currentPassword && (
              <span className="text-[#ff6b6b] text-xs mt-0.5">{errors.currentPassword.message}</span>
            )}
          </div>

          {/* 新密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#B3B3B3] text-xs font-medium">新密码</label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                placeholder="最少 6 位新密码"
                {...register("newPassword")}
                className="bg-transparent border-[#262626] text-[#F5F5F5] pr-10 focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] hover:text-[#F5F5F5]"
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.newPassword && (
              <span className="text-[#ff6b6b] text-xs mt-0.5">{errors.newPassword.message}</span>
            )}
          </div>

          {/* 确认新密码 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[#B3B3B3] text-xs font-medium">确认新密码</label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                placeholder="请再次输入新密码"
                {...register("confirmNewPassword")}
                className="bg-transparent border-[#262626] text-[#F5F5F5] pr-10 focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] hover:text-[#F5F5F5]"
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.confirmNewPassword && (
              <span className="text-[#ff6b6b] text-xs mt-0.5">{errors.confirmNewPassword.message}</span>
            )}
          </div>

          <Button
            type="submit"
            disabled={updatingPassword}
            className="h-10 rounded-[12px] bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-semibold text-xs flex items-center justify-center cursor-pointer select-none"
          >
            {updatingPassword && <Loader2 className="size-3 animate-spin mr-1.5" />}
            更新密码
          </Button>
        </form>
      </div>

      {/* 区块 2: 两步验证 (2FA) */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="flex justify-between items-center select-none">
          <div className="text-[#F5F5F5] text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-[#6D5EF9]" />
            两步验证 (2FA)
          </div>
          <div>
            {twoFactorEnabled ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                已启用
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-[#262626] text-[#B3B3B3] border-[#333333]">
                未启用
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center select-none">
          <p className="text-[#B3B3B3] text-xs leading-relaxed max-w-lg">
            启用两步验证后，每次在新的设备上登录时，除输入账号密码外，还需输入您手机端身份验证器应用生成的 6 位一次性代码，为账户带来多重安全防线。
          </p>
          <div>
            {twoFactorEnabled ? (
              <Button
                variant="outline"
                className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                onClick={() => setDisable2faOpen(true)}
              >
                禁用两步验证
              </Button>
            ) : (
              <Button
                className="h-9 rounded-[12px] text-xs bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-semibold flex items-center gap-1"
                onClick={handleEnable2faClick}
              >
                启用两步验证
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 区块 3: 活跃登录设备 */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="text-[#F5F5F5] text-sm font-semibold select-none flex items-center gap-1.5">
          <Laptop className="size-4 text-[#6D5EF9]" />
          活跃登录设备
        </div>
        <div className="overflow-x-auto border border-[#262626] rounded-xl select-none">
          <table className="w-full text-left border-collapse text-xs text-[#B3B3B3]">
            <thead>
              <tr className="bg-[#171717] border-b border-[#262626] text-[#F5F5F5] font-semibold">
                <th className="p-3">设备 / 浏览器</th>
                <th className="p-3">IP 地址</th>
                <th className="p-3">最后活跃时间</th>
                <th className="p-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((dev) => (
                <tr key={dev.id} className="border-b border-[#262626]/60 hover:bg-[#171717]/40 transition-colors">
                  <td className="p-3 flex items-center gap-2 font-medium text-[#F5F5F5]">
                    {dev.name.includes("iPhone") ? (
                      <Smartphone className="size-3.5 text-[#B3B3B3]" />
                    ) : (
                      <Laptop className="size-3.5 text-[#B3B3B3]" />
                    )}
                    <span>{dev.name}</span>
                    {dev.current && (
                      <span className="text-[9px] px-1 bg-[#6D5EF9]/10 text-[#6D5EF9] border border-[#6D5EF9]/20 rounded font-semibold leading-none py-0.5">
                        当前设备
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono">{dev.ip}</td>
                  <td className="p-3">{dev.lastActive}</td>
                  <td className="p-3 text-right">
                    {!dev.current && (
                      <Button
                        variant="ghost"
                        className="h-7 rounded-[10px] px-2 text-[10px] text-[#B3B3B3] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                        onClick={() => handleDeviceLogoutClick(dev)}
                      >
                        退出此设备
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {devices.length > 1 && (
          <div className="flex justify-end select-none pt-1">
            <Button
              variant="outline"
              className="h-9 rounded-[12px] text-xs text-[#EF4444] border border-[#EF4444]/30 bg-transparent hover:bg-[#EF4444] hover:text-white transition-all font-semibold"
              onClick={() => setLogoutAllOthersOpen(true)}
            >
              退出所有其他设备
            </Button>
          </div>
        )}
      </div>

      {/* ============================================================
          DIALOG 弹窗管理
         ============================================================ */}

      {/* 2FA 启用 Modal */}
      <Dialog open={enable2faOpen} onOpenChange={setEnable2faOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-[#F5F5F5] text-base font-bold select-none">
              配置身份验证器 (2FA)
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed select-none pt-1">
              使用您的手机验证器应用（如 Google Authenticator）扫描下方二维码：
            </DialogDescription>
          </DialogHeader>

          {/* 二维码展示 (带精致背景) */}
          <div className="flex flex-col items-center gap-3 py-1">
            <div className="bg-[#171717] p-3 border border-[#262626] rounded-xl flex items-center justify-center shadow-inner">
              <img src={dynamicQrCode} alt="TOTP QR Code" className="size-36 object-contain rounded-lg" />
            </div>
            <div className="text-center select-all font-mono text-[10px] text-[#B3B3B3] bg-[#171717] px-2 py-1.5 rounded-lg border border-[#262626] max-w-xs truncate">
              密钥: {totpSecret}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[#B3B3B3] text-xs font-semibold select-none pl-0.5">验证码</label>
            <Input
              type="text"
              maxLength={6}
              placeholder="请输入 6 位验证器密码"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              className="bg-transparent border-[#262626] text-[#F5F5F5] tracking-widest text-center text-sm font-bold focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
            />
          </div>

          <DialogFooter className="flex gap-2 justify-end pt-2 select-none">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                  disabled={verifying2fa}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              className="h-9 rounded-[12px] text-xs bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-semibold"
              onClick={handleConfirm2fa}
              disabled={verifying2fa}
            >
              {verifying2fa && <Loader2 className="size-3 animate-spin mr-1" />}
              确认并启用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA 禁用 Modal (红色二次确认) */}
      <Dialog open={disable2faOpen} onOpenChange={setDisable2faOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-[#EF4444] text-base font-bold select-none">
              确定要禁用两步验证 (2FA) 吗？
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed select-none pt-1">
              禁用两步验证将削弱账户安全性，不再强制校验动态口令。请输入账户当前密码确认：
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-[#B3B3B3] text-xs font-semibold select-none pl-0.5">账号密码</label>
            <Input
              type="password"
              placeholder="请输入当前登录密码"
              value={confirmPasswordFor2fa}
              onChange={(e) => setConfirmPasswordFor2fa(e.target.value)}
              className="bg-transparent border-[#262626] text-[#F5F5F5] focus-visible:border-[#EF4444] focus-visible:ring-2 focus-visible:ring-[#EF4444]/20"
            />
          </div>

          <DialogFooter className="flex gap-2 justify-end pt-2 select-none">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                  disabled={verifying2fa}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              className="h-9 rounded-[12px] text-xs bg-[#EF4444] hover:bg-[#EF4444]/90 text-white font-semibold"
              onClick={handleDisable2fa}
              disabled={verifying2fa}
            >
              {verifying2fa && <Loader2 className="size-3 animate-spin mr-1" />}
              确认禁用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 设备强退二次确认 Dialog */}
      <Dialog open={deviceConfirmOpen} onOpenChange={setDeviceConfirmOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-[#EF4444] text-base font-bold">
              强制退出该设备？
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed pt-1.5">
              您确定要强制退出设备 <strong className="text-[#F5F5F5]">{targetDevice?.name}</strong> 吗？退出的设备将丢失其当前登录 Session 并必须重新输入密码。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                  disabled={deviceProcessing}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              className="h-9 rounded-[12px] text-xs bg-[#EF4444] hover:bg-[#EF4444]/90 text-white flex items-center gap-1"
              onClick={handleConfirmDeviceLogout}
              disabled={deviceProcessing}
            >
              {deviceProcessing && <RefreshCw className="size-3 animate-spin" />}
              退出设备
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 强退所有其他设备二次确认 Dialog */}
      <Dialog open={logoutAllOthersOpen} onOpenChange={setLogoutAllOthersOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-[#EF4444] text-base font-bold">
              确定要退出所有其他登录设备？
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed pt-1.5">
              此操作会强制断开除当前设备以外的其他所有活跃会话（如您的手机、办公电脑）。该操作不可逆，请确认：
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                  disabled={deviceProcessing}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              className="h-9 rounded-[12px] text-xs bg-[#EF4444] hover:bg-[#EF4444]/90 text-white flex items-center gap-1"
              onClick={handleLogoutAllOthers}
              disabled={deviceProcessing}
            >
              {deviceProcessing && <RefreshCw className="size-3 animate-spin" />}
              确认退登所有
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
