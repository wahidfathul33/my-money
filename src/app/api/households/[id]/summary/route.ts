import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { requireHouseholdAccess } from '@/lib/services/households';
import { NotFoundError, UnauthenticatedError } from '@/lib/api/errors';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { serializeMoney } from '@/lib/finance/money';
import { currentLocalPeriod } from '@/lib/date/timezone';
import { getHouseholdSummary } from '@/features/reports/household-queries';

/**
 * `GET /api/households/[id]/summary` — docs/06-api-contracts.md §6:
 *
 *   { income, expense, net,
 *     byCategory: [{ kind: 'system', systemKey, label, amount, share } |
 *                  { kind: 'custom', categoryId, label, ownerName, amount, share }],
 *     byMember: [{ userId, name, expensePaid, incomeContributed, savingsContributed }],
 *     budgets:  [{ categoryKey, label, amount, spent, status, byMember[] }] }
 *
 * Same membership-check shape as
 * src/app/api/households/[id]/net-worth/route.ts: this route re-verifies
 * membership itself (nothing under `/api/**` sits behind the
 * `/household/[id]` page layout's guard), returning 404 — never 403 — for a
 * non-member (docs/12-security-and-auth.md §3, threat H2).
 *
 * `budgets[].byMember` isn't populated by `getHouseholdSummary` today (no UI
 * consumes the per-member budget breakdown from THIS endpoint yet — the
 * budgets page has its own route for that) — each row's `byMember` is
 * always `[]` here rather than omitted, so the response still matches the
 * contract's shape exactly.
 */

const PERIOD_RE = /^\d{4}-\d{2}$/;
const RATE_LIMIT = { windowMs: 60_000, max: 60 };

const querySchema = z.object({ period: z.string().regex(PERIOD_RE, 'Periode tidak valid').optional() });

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

  const { allowed } = checkRateLimit(`households-summary:${userId}`, RATE_LIMIT);
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
    const summary = await getHouseholdSummary(householdId, period);
    return NextResponse.json({
      income: serializeMoney(summary.income),
      expense: serializeMoney(summary.expense),
      net: serializeMoney(summary.net),
      byCategory: summary.byCategory.map((c) =>
        c.kind === 'system'
          ? { kind: 'system', systemKey: c.systemKey, label: c.label, amount: serializeMoney(c.amount), share: c.share }
          : {
              kind: 'custom',
              categoryId: c.categoryId,
              label: c.label,
              ownerName: c.ownerName,
              amount: serializeMoney(c.amount),
              share: c.share,
            },
      ),
      byMember: summary.byMember.map((m) => ({
        userId: m.userId,
        name: m.name,
        expensePaid: serializeMoney(m.expensePaid),
        incomeContributed: serializeMoney(m.incomeContributed),
        savingsContributed: serializeMoney(m.savingsContributed),
      })),
      budgets: summary.budgets.map((b) => ({
        categoryKey: b.categoryKey,
        label: b.label,
        amount: serializeMoney(b.amount),
        spent: serializeMoney(b.spent),
        status: b.status,
        byMember: [] as never[],
      })),
    });
  } catch (err) {
    console.error('[GET /api/households/[id]/summary]', err);
    return errorResponse('INTERNAL', 'Terjadi kesalahan. Data Anda aman — coba lagi.', 500);
  }
}
