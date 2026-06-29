/**
 * Invoice Download API — 下载发票
 * Phase 2: 从数据库查询真实发票 URL（替换旧 mock PDF）
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/server/audit";

// SSRF 安全校验：仅允许代理下载来自 Stripe 官方域名的发票文件
function isUrlWhitelisted(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return (
      url.protocol === "https:" &&
      (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const { id: invoiceId } = await params;

    // 查询真实发票
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: session.user.id },
      select: { stripeInvoiceUrl: true, stripeInvoicePdf: true, workspaceId: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "发票不存在" }, { status: 404 });
    }

    // 记录发票下载审计日志
    await writeAuditLog({
      actor: session.user.email || session.user.id,
      action: "invoice.download",
      targetType: "invoice",
      targetId: invoiceId,
      detail: `下载发票 ${invoiceId}`,
      workspaceId: invoice.workspaceId,
      riskLevel: "low",
    });

    // 如果有 Stripe URL，重定向到 Stripe
    if (invoice.stripeInvoiceUrl) {
      if (!isUrlWhitelisted(invoice.stripeInvoiceUrl)) {
        return NextResponse.json({ error: "非法的发票重定向链接" }, { status: 400 });
      }
      return NextResponse.redirect(invoice.stripeInvoiceUrl);
    }

    if (invoice.stripeInvoicePdf) {
      // 代理下载 PDF 时的 SSRF 校验
      if (!isUrlWhitelisted(invoice.stripeInvoicePdf)) {
        return NextResponse.json({ error: "非法的发票下载链接" }, { status: 400 });
      }

      // 代理下载 PDF
      const response = await fetch(invoice.stripeInvoicePdf);
      const pdfBuffer = await response.arrayBuffer();
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=invoice_${invoiceId}.pdf`,
        },
      });
    }

    return NextResponse.json({ error: "发票文件不可用" }, { status: 404 });
  } catch (error) {
    console.error("Failed to download invoice:", error);
    return NextResponse.json({ error: "下载失败" }, { status: 500 });
  }
}
