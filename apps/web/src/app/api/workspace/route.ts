import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const memberWorkspaces = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      select: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const workspaces = memberWorkspaces.map((m) => m.workspace);

    if (workspaces.length === 0) {
      return NextResponse.json([{ id: "default", name: "默认工作区" }]);
    }
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("GET /api/workspace error, falling back:", error);
    return NextResponse.json([{ id: "default", name: "默认工作区" }]);
  }
}
