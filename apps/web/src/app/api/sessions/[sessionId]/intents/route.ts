import { NextResponse } from "next/server";
import { buildWorkspaceContext } from "@/lib/workspace";
import { startAgentWorkflowRun } from "@/lib/server/workflow-run-starter";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const ctx = await buildWorkspaceContext(request);
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const { input, agentId, workspaceId } = body;
    if (!input || !agentId || !workspaceId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const result = await startAgentWorkflowRun({
      agentId,
      input,
      workspaceId,
      userId: ctx.userId,
    });

    const { taskId, ...rest } = result;

    return NextResponse.json({
      success: true,
      taskId,
      ...rest
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
