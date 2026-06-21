import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  // 返回 Mock 的用户偏好设定
  return NextResponse.json({
    theme: "dark",
    language: "zh-CN",
    defaultWorkspace: "default",
    emailNotifications: {
      taskCompleted: true,
      workflowFailed: true,
      approvalPending: false,
      weeklySummary: true,
    },
    systemNotifications: {
      approvalRequest: true,
      proposalGenerated: false,
      connectorFailure: true,
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return NextResponse.json({ error: "保存偏好失败" }, { status: 500 });
  }
}
