import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  // 返回 2FA 状态及登录设备列表
  return NextResponse.json({
    twoFactorEnabled: false,
    devices: [
      { id: "1", name: "Windows 11 / Chrome 126", ip: "192.168.1.102 (中国深圳)", lastActive: "刚刚", current: true },
      { id: "2", name: "macOS Sonoma / Safari", ip: "118.23.45.67 (中国上海)", lastActive: "2小时前", current: false },
      { id: "3", name: "iPhone 15 / Mobile Safari", ip: "223.104.5.12 (中国北京)", lastActive: "1天前", current: false }
    ]
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "change-password") {
      // 密码强度与旧密码比对模拟通过
      return NextResponse.json({ success: true, message: "密码更新成功" });
    }

    if (action === "enable-2fa") {
      // 返回 Mock 的谷歌验证码二维码数据
      return NextResponse.json({
        success: true,
        qrCode: "otpauth://totp/HermesClaw:user@hermesclaw.ai?secret=MOCKSECRET1234567&issuer=HermesClaw",
        secret: "MOCKSECRET1234567"
      });
    }

    if (action === "confirm-2fa") {
      return NextResponse.json({ success: true, message: "双重验证启用成功" });
    }

    if (action === "disable-2fa") {
      return NextResponse.json({ success: true, message: "双重验证已成功禁用" });
    }

    if (action === "logout-device") {
      return NextResponse.json({ success: true, message: "设备已被成功强制登出" });
    }

    if (action === "logout-all-others") {
      return NextResponse.json({ success: true, message: "已成功登出所有其他设备" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "操作失败，请重试" }, { status: 500 });
  }
}
