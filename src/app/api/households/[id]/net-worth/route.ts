import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { requireHouseholdAccess } from '@/lib/services/households';
import { NotFoundError, UnauthenticatedError } from '@/lib/api/errors';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { serializeMoney } from '@/lib/finance/money';
import { getHouseholdNetWorth } from '@/features/net-worth/queries';

/**
 * `GET /api/households/[id]/net-worth` — docs/06-api-contracts.md §6:
 *
 *   { byMember: [{ userId, name, sharing, assets, liabilities, netWorth }],
 *     totals:   { totalAssets, totalLiabilities, netWorth },
 *     coverage: { memberCount, contributingCount } }
 *
 * `byMember` is deliberately the FIRST key — ADR-029's primary view — and
 * `coverage` is NEVER omitted from this response; there is no code path
 * here that returns `totals` without it.
 *
 * Same membership-check shape as
 * src/app/api/households/[id]/transactions/route.ts: nothing under
 * `/api/**` sits behind the `/household/[id]` page layout's guard (that's a
 * page layout, not middleware), so this route re-verifies membership
 * itself via `requireHouseholdAccess`, returning `404` (not `403`) for a
 * non-member — docs/12-security-and-auth.md §3, threat H2: distinguishing
 * "doesn't exist" from "exists but you're not in it" would confirm a
 * guessed UUID belongs to someone else's household.
 */

const RATE_LIMIT = { windowMs: 60_000, max: 60 };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: householdId } = await context.params;

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

  try {
    await requireHouseholdAccess(userId, householdId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return errorResponse('NOT_A_MEMBER', err.message, 404);
    }
    throw err;
  }

  const { allowed } = checkRateLimit(`households-net-worth:${userId}`, RATE_LIMIT);
  if (!allowed) {
    return errorResponse('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.', 429);
  }

  try {
    const overview = await getHouseholdNetWorth(householdId);

    return NextResponse.json({
      byMember: overview.byMember.map((m) => ({
        userId: m.userId,
        name: m.name,
        sharing: m.sharing,
        assets: serializeMoney(m.assets),
        liabilities: serializeMoney(m.liabilities),
        netWorth: serializeMoney(m.netWorth),
      })),
      totals: {
        totalAssets: serializeMoney(overview.totals.totalAssets),
        totalLiabilities: serializeMoney(overview.totals.totalLiabilities),
        netWorth: serializeMoney(overview.totals.netWorth),
      },
      coverage: overview.coverage,
    });
  } catch (err) {
    console.error('[GET /api/households/[id]/net-worth]', err);
    return errorResponse('INTERNAL', 'Terjadi kesalahan. Data Anda aman — coba lagi.', 500);
  }
}
