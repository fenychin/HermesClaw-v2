/**
 * Auth.js v5 配置
 * —— 支持 Google OAuth 与 邮箱+密码登录（Credentials Provider）
 * —— 集成 PrismaAdapter，将会话状态写入数据库（兼容 SQLite 并采用 JWT 策略）
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
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
  /** 集成 PrismaAdapter 以持久化 OAuth 用户 */
  adapter: PrismaAdapter(prisma),
  /** 信任请求中的 Host 头（本地开发/反向代理环境必需） */
  trustHost: true,
  secret: process.env.AUTH_SECRET || "hermesclaw-default-development-secret-key-32chars",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "placeholder-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder-client-secret",
      allowDangerousEmailAccountLinking: true, // 允许关联同邮箱的凭据账户与 Google 账户
    }),
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
        token.role = (user as any).role || "member";
      }
      return token;
    },
    /** 将自定义字段从 JWT 同步到 session */
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = (token as any).role ?? "member";
      return session;
    },
  },
});

