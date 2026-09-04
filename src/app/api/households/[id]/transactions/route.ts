import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { requireHouseholdAccess } from '@/lib/services/households';
import { NotFoundError, UnauthenticatedError } from '@/lib/api/errors';
import { serializeMoney } from '@/lib/finance/money';
import {
  listHouseholdTransactionsPage,
  type HouseholdTransactionItem,
} from '@/features/sharing/household-transactions-queries';

/**
 * `GET /api/households/[id]/transactions` — todo.md: "dengan
 * requireHouseholdMember". Nothing under `/api/**` sits behind
 * src/app/(app)/household/[householdId]/layout.tsx's guard (that's a page
 * layout, not middleware), so this route re-verifies active membership
 * itself, exactly like the Server Component page does implicitly by
 * rendering inside that layout — same `NotFoundError`-for-non-member shape
 * as everywhere else (docs/12-security-and-auth.md §3, threat H2).
 *
 * Response shape mirrors `GET /api/transactions` (src/app/api/transactions/route.ts):
 * `{ items, nextCursor }` — no `dayTotals` here, this page doesn't offer
 * one (out of scope: task 19 owns household net-worth/aggregate reporting).
 */

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  member: z.uuid().optional(),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function toItemDto(item: HouseholdTransactionItem) {
  return {
    id: item.id,
    type: item.type,
    amount: serializeMoney(item.amount),
    transactionDate: item.transactionDate.toISOString(),
    note: item.note,
    category: item.category,
    payerId: item.payerId,
    payerName: item.payerName,
  };
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
      return errorResponse('NOT_FOUND', err.message, 404);
    }
    throw err;
  }

  const rawParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return errorResponse('VALIDATION', 'Parameter tidak valid', 400);
  }
  const { cursor, limit, member } = parsed.data;

  try {
    const { items, nextCursor } = await listHouseholdTransactionsPage(householdId, {
      cursor,
      limit,
      memberUserId: member,
    });

    return NextResponse.json({ items: items.map(toItemDto), nextCursor });
  } catch (err) {
    console.error('[GET /api/households/[id]/transactions]', err);
    return errorResponse('INTERNAL', 'Terjadi kesalahan. Data Anda aman — coba lagi.', 500);
  }
}
