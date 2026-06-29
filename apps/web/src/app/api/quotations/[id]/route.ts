import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/api-utils";
import { type WorkspaceContext } from "@/lib/workspace";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditedWrite } from "@/lib/server/audited-write";
import { actorFromSession } from "@/lib/server/audit";
import { serializeQuotation } from "@/lib/server/quotation-service";

const QuotationStatusUpdateSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected"]),
  reason: z.string().max(500).optional(),
});

/**
 * PATCH /api/quotations/[id]
 * BUG-06 fix: Quotation state change endpoint driving funnel level-3 (accepted orders).
 * draft -> sent -> accepted/rejected
 */
export const PATCH = withRBAC(
  async (
    request: Request,
    ctx: WorkspaceContext,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    if (!id) return ApiResponse.error("Missing quotation ID", 400);

    const body = QuotationStatusUpdateSchema.safeParse(await request.json());
    if (!body.success) return ApiResponse.error(`Validation failed: ${body.error.message}`, 400);

    try {
      const existing = await prisma.quotation.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!existing) return ApiResponse.error("Quotation not found", 404);

      const { status, reason } = body.data;

      const updated = await auditedWrite(
        {
          actor: await actorFromSession(),
          action: "quotation.status.update",
          targetType: "quotation",
          targetId: id,
          detail: `报价状态变更: ${existing.status} -> ${status}${reason ? ` (${reason})` : ""}`,
          riskLevel: status === "accepted" ? "medium" : "low",
          workspaceId: ctx.workspaceId,
          automationLevel: "L2",
          triggeredBy: "user",
          contextSnapshot: {
            inquiryId: existing.projectId,
            previousStatus: existing.status,
            newStatus: status,
            totalAmount: existing.totalAmount,
            currency: existing.currency,
            version: existing.version,
          },
        },
        async () => {
          const result = await prisma.quotation.update({
            where: { id },
            data: { status },
          });
          if (status === "accepted" && existing.projectId) {
            await prisma.inquiry.updateMany({
              where: { id: existing.projectId, workspaceId: ctx.workspaceId },
              data: { replied: true },
            });
          }
          return result;
        },
      );

      return ApiResponse.ok(serializeQuotation(updated));
    } catch (e) {
      logger.error(`PATCH /api/quotations/${id}: failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
      return errorResponse("Failed to update quotation status", 500);
    }
  },
  "MEMBER",
);