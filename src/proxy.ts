import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export default async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Exclude:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, static assets
     * - /api/* (route handlers handle their own auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
