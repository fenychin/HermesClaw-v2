import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    if (workspaces.length === 0) {
      return NextResponse.json([{ id: "default", name: "默认工作区" }]);
    }
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("GET /api/workspaces error, falling back:", error);
    return NextResponse.json([{ id: "default", name: "默认工作区" }]);
  }
}
