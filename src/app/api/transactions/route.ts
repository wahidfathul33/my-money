import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { UnauthenticatedError } from '@/lib/api/errors';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { serializeMoney } from '@/lib/finance/money';
import {
  dayTotalsRangeForItems,
  getDayTotals,
  listTransactionsPage,
  type TransactionHistoryFilters,
  type TransactionHistoryItem,
} from '@/features/transactions/history-queries';

/**
 * `GET /api/transactions` — docs/06-api-contracts.md §6, the route handler
 * this task's whole "read inkremental" (infinite scroll, filters) is meant
 * to be fetched through instead of a Server Component (only the initial
 * page is a Server Component read — src/app/(app)/transactions/page.tsx).
 *
 * Response shape is fixed by the contract:
 * `{ items, nextCursor, dayTotals }` — `dayTotals` computed HERE, server
 * side, from `getDayTotals`, never summed by the client (spec.md
 * "Batasan: Jangan ... menjumlahkan subtotal di klien").
 */

const MIN_SEARCH_LENGTH = 2;
const SEARCH_RATE_LIMIT = { windowMs: 60_000, max: 30 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  walletId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  from: z.string().regex(DATE_RE, 'Tanggal tidak valid').optional(),
  to: z.string().regex(DATE_RE, 'Tanggal tidak valid').optional(),
  q: z.string().trim().max(280).optional(),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function toItemDto(item: TransactionHistoryItem) {
  return {
    id: item.id,
    type: item.type,
    amount: serializeMoney(item.amount),
    transactionDate: item.transactionDate.toISOString(),
    note: item.note,
    category: item.category,
    wallet: item.wallet,
    transferFrom: item.transferFrom,
    transferTo: item.transferTo,
    counterpartyName: item.counterpartyName,
    householdId: item.householdId,
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

  const rawParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return errorResponse('VALIDATION', 'Parameter tidak valid', 400);
  }
  const { cursor, limit, walletId, categoryId, type, from, to, q } = parsed.data;

  const searchActive = Boolean(q && q.length >= MIN_SEARCH_LENGTH);
  if (searchActive) {
    const { allowed } = checkRateLimit(`transactions-search:${userId}`, SEARCH_RATE_LIMIT);
    if (!allowed) {
      return errorResponse('RATE_LIMITED', 'Terlalu banyak permintaan. Tunggu sebentar.', 429);
    }
  }

  const filters: TransactionHistoryFilters = { walletId, categoryId, type, from, to, q };

  try {
    const { items, nextCursor } = await listTransactionsPage(userId, { cursor, limit, filters });

    const dayTotals: Record<string, { income: string; expense: string }> = {};
    const range = dayTotalsRangeForItems(items);
    if (range) {
      const totals = await getDayTotals(userId, range, filters);
      for (const [date, total] of Object.entries(totals)) {
        dayTotals[date] = { income: serializeMoney(total.income), expense: serializeMoney(total.expense) };
      }
    }

    return NextResponse.json({
      items: items.map(toItemDto),
      nextCursor,
      dayTotals,
    });
  } catch (err) {
    console.error('[GET /api/transactions]', err);
    return errorResponse('INTERNAL', 'Terjadi kesalahan. Data Anda aman — coba lagi.', 500);
  }
}
