import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

export const GET = (req: NextRequest) => handlers.GET(req);
export const POST = (req: NextRequest) => handlers.POST(req);
