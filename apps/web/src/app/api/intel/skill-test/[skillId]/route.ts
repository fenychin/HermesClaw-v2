// @deprecated: use /api/intelligence/skill-test/[skillId] instead
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const { skillId } = await params;
  return NextResponse.redirect(
    new URL(`/api/intelligence/skill-test/${skillId}`, request.url),
    { status: 301 }
  );
}
