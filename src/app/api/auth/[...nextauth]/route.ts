import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { checkLoginRateLimit, getClientIp } from '@/lib/auth/rate-limit';

export const { GET } = handlers;

/**
 * POST covers both sign-in triggers: initiating an OAuth flow's provider
 * step and, more importantly, sending a magic-link email
 * (`/api/auth/signin/nodemailer`) — the endpoint that's actually abusable
 * for spamming an inbox or probing which emails have accounts. Rate limited
 * per docs/12-security-and-auth.md §7 (login only; see src/lib/auth/rate-limit.ts).
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname.startsWith('/api/auth/signin/')) {
    const ip = getClientIp(request.headers);
    const { allowed } = checkLoginRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' },
        { status: 429 },
      );
    }
  }

  return handlers.POST(request);
}
