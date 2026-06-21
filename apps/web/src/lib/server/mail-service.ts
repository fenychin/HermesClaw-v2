/**
 * 邮件服务 (Mail Service)
 * —— 开发环境 console.log 输出，生产环境通过 Resend/SendGrid 发送
 * —— Phase 2 新增
 */
import { prisma } from "@/lib/prisma";

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(params: SendMailParams): Promise<{ success: boolean }> {
  const { to, subject, html } = params;

  // 生产环境：通过 Email Connector 发送
  if (process.env.NODE_ENV === "production") {
    // 使用项目中已有的 Email Connector 基础设施
    // 或接入 Resend / SendGrid
    if (process.env.RESEND_API_KEY) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "noreply@hermesclaw.ai",
            to,
            subject,
            html,
          }),
        });

        if (!response.ok) {
          throw new Error(`Resend API error: ${response.statusText}`);
        }
        return { success: true };
      } catch (error) {
        console.error("Failed to send email via Resend:", error);
        return { success: false };
      }
    }

    // 暂无邮件服务
    console.error("[MAIL] Production mode but no email provider configured");
    return { success: false };
  }

  // 开发环境：打印到控制台（带颜色高亮）
  console.log("\n" + "=".repeat(60));
  console.log("\x1b[36m[MAIL DEV]\x1b[0m 发件成功（开发模式 - 未真实发送）");
  console.log(`  收件人: ${to}`);
  console.log(`  主题:   ${subject}`);
  console.log(`  内容:   ${html.substring(0, 200)}${html.length > 200 ? "..." : ""}`);
  console.log("=".repeat(60) + "\n");
  return { success: true };
}

/** 发送密码重置邮件 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<boolean> {
  const result = await sendMail({
    to: email,
    subject: "HermesClaw — 重置密码",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>重置您的 HermesClaw 密码</h2>
        <p>我们收到您的密码重置请求。点击下方按钮重置密码：</p>
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 24px; background: #6D5EF9; color: white;
                  text-decoration: none; border-radius: 8px; font-weight: bold;">
          重置密码
        </a>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
          此链接有效期为 1 小时。如果您没有请求重置密码，请忽略此邮件。
        </p>
        <hr style="border: none; border-top: 1px solid #262626; margin: 24px 0;" />
        <p style="color: #666; font-size: 11px;">
          HermesClaw — AI 外贸智能体平台<br/>
          <a href="https://hermesclaw.ai" style="color: #6D5EF9;">hermesclaw.ai</a>
        </p>
      </div>
    `,
  });
  return result.success;
}
