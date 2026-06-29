import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, guardRole } from "@/lib/workspace"
import { listMembers, inviteMember, changeMemberRole, removeMember, MemberServiceError, InviteMemberSchema, ChangeRoleSchema, RemoveMemberSchema } from "@/lib/server/workspace-member-service"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const url = new URL(request.url)
    return successResponse(await listMembers(ctx.workspaceId, Math.max(Number(url.searchParams.get("page")) || 1, 1), Math.min(Number(url.searchParams.get("limit")) || 50, 100)))
  } catch { return errorResponse("服务器内部错误") }
}

async function decode<T>(request: Request, schema: any): Promise<T | Response> {
  const ctx = await buildWorkspaceContext(request); const guard = guardRole(ctx.role, "ADMIN"); if (guard) return guard
  const body = await request.json(); const p = schema.safeParse(body)
  if (!p.success) return errorResponse(`参数错误: ${p.error.issues.map((i: any) => i.message).join(", ")}`, 400)
  return { ctx, data: p.data } as T
}

export async function POST(request: Request) {
  try { const r = await decode<any>(request, InviteMemberSchema); if (r instanceof Response) return r; return successResponse({ member: await inviteMember(r.ctx.workspaceId, r.data.email, r.data.role) }, 201) }
  catch (e) { if (e instanceof MemberServiceError) return errorResponse(e.message, e.httpStatus); return errorResponse("服务器内部错误") }
}

export async function PATCH(request: Request) {
  try { const r = await decode<any>(request, ChangeRoleSchema); if (r instanceof Response) return r; return successResponse({ member: await changeMemberRole(r.ctx.workspaceId, r.data.userId, r.data.role) }) }
  catch (e) { if (e instanceof MemberServiceError) return errorResponse(e.message, e.httpStatus); return errorResponse("服务器内部错误") }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request);
    const guard = guardRole(ctx.role, "ADMIN");
    if (guard) return guard;

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const p = RemoveMemberSchema.safeParse({ userId });
    if (!p.success) {
      return errorResponse(`参数错误: ${p.error.issues.map((i: any) => i.message).join(", ")}`, 400);
    }

    return successResponse(await removeMember(ctx.workspaceId, p.data.userId));
  } catch (e) {
    if (e instanceof MemberServiceError) return errorResponse(e.message, e.httpStatus);
    return errorResponse("服务器内部错误");
  }
}
