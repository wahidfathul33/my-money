import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { UnauthenticatedError } from '@/lib/api/errors';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { serializeMoney } from '@/lib/finance/money';
import { getNetWorthHistory, type NetWorthSnapshotPoint } from '@/features/net-worth/queries';

/**
 * `GET /api/net-worth/history` — docs/06-api-contracts.md §6:
 * `range=3m|6m|1y|all -> { snapshots: [{ date, netWorth, totalAssets,
 * totalLiabilities, breakdown }] }`. Reads `net_worth_snapshots` directly
 * (src/features/net-worth/queries.ts's `getNetWorthHistory`) — never
 * recomputed live, since the whole point is a POINT-IN-TIME series.
 */

const RATE_LIMIT = { windowMs: 60_000, max: 60 };

const querySchema = z.object({ range: z.enum(['3m', '6m', '1y', 'all']).default('all') });

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function toDto(point: NetWorthSnapshotPoint) {
  return {
    date: point.date,
    netWorth: serializeMoney(point.netWorth),
    totalAssets: serializeMoney(point.totalAssets),
    totalLiabilities: serializeMoney(point.totalLiabilities),
    breakdown: point.breakdown,
  };
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

  const { allowed } = checkRateLimit(`net-worth-history:${userId}`, RATE_LIMIT);
  if (!allowed) {
    return errorResponse('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.', 429);
  }

  const rawParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return errorResponse('VALIDATION', 'Parameter tidak valid', 400);
  }

  try {
    const snapshots = await getNetWorthHistory(userId, parsed.data.range);
    return NextResponse.json({ snapshots: snapshots.map(toDto) });
  } catch (err) {
    console.error('[GET /api/net-worth/history]', err);
    return errorResponse('INTERNAL', 'Terjadi kesalahan. Data Anda aman — coba lagi.', 500);
  }
}
