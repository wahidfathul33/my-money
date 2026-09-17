import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { UnauthenticatedError } from '@/lib/api/errors';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { serializeMoney } from '@/lib/finance/money';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { getPeriodSummary } from '@/features/reports/queries';

/**
 * `GET /api/reports/summary` — docs/06-api-contracts.md §6:
 * `period=YYYY-MM -> { income, expense, net, byCategory[], dailySeries[] }`.
 * Standard per-user read rate limit, same shape as
 * `GET /api/transactions`'s search parameter (src/app/api/transactions/route.ts).
 */

const PERIOD_RE = /^\d{4}-\d{2}$/;
const RATE_LIMIT = { windowMs: 60_000, max: 60 };

const querySchema = z.object({ period: z.string().regex(PERIOD_RE, 'Periode tidak valid').optional() });

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return errorResponse('UNAUTHENTICATED', err.message, 401);
    }
    throw err;
  }

  const { allowed } = checkRateLimit(`reports-summary:${userId}`, RATE_LIMIT);
  if (!allowed) {
    return errorResponse('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.', 429);
  }

  const rawParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return errorResponse('VALIDATION', 'Parameter tidak valid', 400);
  }
  const period = parsed.data.period ?? currentLocalPeriod();

  try {
    const summary = await getPeriodSummary(userId, period);
    return NextResponse.json({
      income: serializeMoney(summary.income),
      expense: serializeMoney(summary.expense),
      net: serializeMoney(summary.net),
      byCategory: summary.byCategory.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        icon: c.icon,
        color: c.color,
        amount: serializeMoney(c.amount),
      })),
      dailySeries: summary.dailySeries.map((d) => ({
        date: d.date,
        net: serializeMoney(d.net),
        cumulative: serializeMoney(d.cumulative),
      })),
    });
  } catch (err) {
    console.error('[GET /api/reports/summary]', err);
    return errorResponse('INTERNAL', 'Terjadi kesalahan. Data Anda aman — coba lagi.', 500);
  }
}
