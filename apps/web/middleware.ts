import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // /pricing is fully public — skip session refresh to avoid unnecessary Supabase call
  if (request.nextUrl.pathname === '/pricing') {
    return NextResponse.next()
  }
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
