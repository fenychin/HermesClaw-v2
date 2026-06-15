import { NextResponse } from 'next/server'

export const ApiResponse = {
  ok: <T>(data: T) => NextResponse.json({ success: true, data }),
  error: (message: string, status = 500) => NextResponse.json({ success: false, error: message }, { status }),
}
