/**
 * Auth.js v5 配置
 * —— 邮箱 + 密码登录（Credentials Provider）
 * —— JWT 会话策略（兼容 SQLite）
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// ============================================================
// 扩展 Session 类型，加入自定义字段（id / role）
// ============================================================
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  /** 信任请求中的 Host 头（本地开发/反向代理环境必需） */
  trustHost: true,
  secret: process.env.AUTH_SECRET || "hermesclaw-default-development-secret-key-32chars",
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    /** 将自定义字段（id / role）写入 JWT */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
    /** 将自定义字段从 JWT 同步到 session */
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = (token as unknown as { role: string }).role ?? "member";
      return session;
    },
  },
});
