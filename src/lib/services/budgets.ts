/**
 * Budgets service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). Every household mutation re-verifies membership INSIDE
 * the transaction via `requireHouseholdMember` — tasks/14-budgets/spec.md
 * "Batasan": "peran diperiksa untuk budget household" — with NO owner
 * requirement, unlike most household-scoped actions elsewhere in this app:
 * tasks/14-budgets/spec.md "Dua Cakupan" is explicit that budgets are one of
 * the few household actions ANY active member may create/edit, not just the
 * owner.
 *
 * `upsertPersonalBudget`/`upsertHouseholdBudget` are true upserts keyed on
 * the DB's own natural-key unique index (`budgets_personal_uniq` /
 * `budgets_household_uniq` — src/lib/db/schema/budgets.ts): re-submitting
 * the same (owner, category, period) updates the existing row's amount/
 * `is_recurring` in place via `ON CONFLICT ... DO UPDATE`, rather than
 * requiring a separate `budgetId` to distinguish create from edit. Category/
 * scope are part of that natural key and therefore immutable after
 * creation — changing "which category" means deleting and creating a new
 * budget, the same "locked after creation" shape
 * src/lib/services/wallets.ts uses for `wallet.type`.
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { budgets, categories, households, users } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { requireHouseholdMember } from '@/lib/auth/require-household';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Money } from '@/lib/finance/money';
import { CATEGORY_CATALOG } from '@/lib/db/seed/categories';
import { periodDateRange, shiftPeriod, toLocalDate, toLocalMonth } from '@/lib/date/timezone';
import type { TransactionClient } from '@/lib/db';

export type BudgetRow = typeof budgets.$inferSelect;

/** Built-in EXPENSE `system_key`s only — a household budget targets consumption, and (docs/03 §13) "hanya dapat dibuat untuk kategori bawaan". */
const HOUSEHOLD_BUDGETABLE_KEYS: ReadonlySet<string> = new Set(
  CATEGORY_CATALOG.filter((entry) => entry.type === 'expense').map((entry) => entry.systemKey),
);

const PERIOD_RE = /^\d{4}-\d{2}$/;

function assertValidPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) {
    throw new ValidationError({ period: ['Periode tidak valid'] });
  }
}

function assertPositiveAmount(amount: Money): void {
  if (amount <= 0n) {
    throw new ValidationError({ amount: ['Jumlah anggaran harus lebih dari Rp0'] });
  }
}

export interface UpsertPersonalBudgetInput {
  categoryId: string;
  amount: Money;
  /** `YYYY-MM`. */
  period: string;
  isRecurring: boolean;
}

/**
 * Verifies the category belongs to the caller AND is an EXPENSE category —
 * a budget is a spending cap, so an income category (todo.md: "verifikasi
 * kepemilikan kategori") can never be a valid target.
 */
export async function upsertPersonalBudget(
  userId: string,
  input: UpsertPersonalBudgetInput,
): Promise<BudgetRow> {
  assertPositiveAmount(input.amount);
  assertValidPeriod(input.period);

  return dbWrite.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: categories.id, type: categories.type })
      .from(categories)
      .where(and(eq(categories.id, input.categoryId), ownedBy(categories, userId)))
      .limit(1);
    if (!category) {
      throw new ValidationError({ categoryId: ['Kategori tidak ditemukan'] });
    }
    if (category.type !== 'expense') {
      throw new ValidationError({ categoryId: ['Anggaran hanya untuk kategori pengeluaran'] });
    }

    const { from, to } = periodDateRange(input.period);

    const [row] = await tx
      .insert(budgets)
      .values({
        id: uuidv7(),
        userId,
        categoryId: input.categoryId,
        amount: input.amount,
        periodType: 'monthly',
        periodStart: from,
        periodEnd: to,
        isRecurring: input.isRecurring,
        createdBy: userId,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.periodStart],
        targetWhere: sql`${budgets.userId} IS NOT NULL`,
        set: { amount: input.amount, isRecurring: input.isRecurring, updatedAt: new Date() },
      })
      .returning();

    return row!;
  });
}

export interface UpsertHouseholdBudgetInput {
  categoryKey: string;
  amount: Money;
  /** `YYYY-MM`. */
  period: string;
  isRecurring: boolean;
}

/**
 * `requireHouseholdMember` with NO `requireOwner` — any active member may
 * create/edit a household budget (tasks/14-budgets/spec.md "Dua Cakupan":
 * "Peran | Pemilik | Anggota mana pun"). `categoryKey` is validated against
 * the canonical catalog's EXPENSE keys only — todo.md: "validasi category_key
 * ada di katalog"; a key that's real but belongs to an INCOME category, or
 * isn't in the catalog at all (including a custom category's `system_key`,
 * which is always NULL and therefore can never match), is rejected the same
 * way.
 */
export async function upsertHouseholdBudget(
  userId: string,
  householdId: string,
  input: UpsertHouseholdBudgetInput,
): Promise<BudgetRow> {
  assertPositiveAmount(input.amount);
  assertValidPeriod(input.period);

  if (!HOUSEHOLD_BUDGETABLE_KEYS.has(input.categoryKey)) {
    throw new ValidationError({ categoryKey: ['Kategori tidak ada di katalog bawaan'] });
  }

  return dbWrite.transaction(async (tx) => {
    await requireHouseholdMember(tx, userId, householdId);

    const { from, to } = periodDateRange(input.period);

    const [row] = await tx
      .insert(budgets)
      .values({
        id: uuidv7(),
        householdId,
        categoryKey: input.categoryKey,
        amount: input.amount,
        periodType: 'monthly',
        periodStart: from,
        periodEnd: to,
        isRecurring: input.isRecurring,
        createdBy: userId,
      })
      .onConflictDoUpdate({
        target: [budgets.householdId, budgets.categoryKey, budgets.periodStart],
        targetWhere: sql`${budgets.householdId} IS NOT NULL`,
        set: { amount: input.amount, isRecurring: input.isRecurring, updatedAt: new Date() },
      })
      .returning();

    return row!;
  });
}

/**
 * Deletes either scope. Whether the row doesn't exist, is a PERSONAL budget
 * owned by someone else, or is a HOUSEHOLD budget for a household the
 * caller isn't an active member of, every path throws the same
 * `NotFoundError` — never confirming to the caller that a guessed id
 * belongs to someone else (docs/12-security-and-auth.md §3, same
 * `NotFoundError`-not-`ForbiddenError` convention as
 * `requireHouseholdMember`).
 */
export async function deleteBudget(userId: string, budgetId: string): Promise<void> {
  await dbWrite.transaction(async (tx) => {
    const [row] = await tx.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1);
    if (!row) {
      throw new NotFoundError('Anggaran tidak ditemukan');
    }

    if (row.userId !== null) {
      if (row.userId !== userId) {
        throw new NotFoundError('Anggaran tidak ditemukan');
      }
    } else {
      // Household scope — any active member may delete, same as create/edit.
      await requireHouseholdMember(tx, userId, row.householdId!);
    }

    await tx.delete(budgets).where(eq(budgets.id, budgetId));
  });
}

/** One materialized period's worth of new budget rows, per scope. */
export interface MaterializeResult {
  personalCreated: number;
  householdCreated: number;
}

/**
 * Rolls `is_recurring` budgets over into a new period — tasks/14-budgets
 * spec.md "Catatan": the cron calling this runs DAILY and this function
 * decides, PER TIMEZONE actually in use (`users.timezone` /
 * `households.timezone` — not a single hardcoded assumption), whether
 * `now` falls on the 1st there; entities in a timezone where it isn't yet
 * the 1st are simply skipped until the day the cron run that IS their 1st
 * comes around.
 *
 * Idempotent: the new row is inserted via `ON CONFLICT DO NOTHING` against
 * the same unique index `upsertPersonalBudget`/`upsertHouseholdBudget` key
 * off — calling this twice for the same `now` (or any `now` that resolves
 * to the same "new period" per timezone) creates the row once, then finds
 * it already there.
 */
export async function materializeRecurringBudgets(now: Date = new Date()): Promise<MaterializeResult> {
  return dbWrite.transaction(async (tx) => {
    const userTimezones = await tx.selectDistinct({ timezone: users.timezone }).from(users);
    const householdTimezones = await tx.selectDistinct({ timezone: households.timezone }).from(households);

    let personalCreated = 0;
    for (const { timezone } of userTimezones) {
      personalCreated += await materializePersonalForTimezone(tx, timezone, now);
    }

    let householdCreated = 0;
    for (const { timezone } of householdTimezones) {
      householdCreated += await materializeHouseholdForTimezone(tx, timezone, now);
    }

    return { personalCreated, householdCreated };
  });
}

/** `now`'s new-period start if `tz`'s local calendar date is the 1st, else `null`. */
function resolveNewPeriodIfFirstOfMonth(tz: string, now: Date): string | null {
  const today = toLocalDate(now, tz);
  if (!today.endsWith('-01')) return null;
  return toLocalMonth(now, tz);
}

async function materializePersonalForTimezone(
  tx: TransactionClient,
  tz: string,
  now: Date,
): Promise<number> {
  const newPeriod = resolveNewPeriodIfFirstOfMonth(tz, now);
  if (!newPeriod) return 0;

  const prevPeriodStart = `${shiftPeriod(newPeriod, -1)}-01`;
  const { from: newStart, to: newEnd } = periodDateRange(newPeriod);

  const templates = await tx
    .select({
      userId: budgets.userId,
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      createdBy: budgets.createdBy,
    })
    .from(budgets)
    .innerJoin(users, eq(users.id, budgets.userId))
    .where(
      and(
        isNotNull(budgets.userId),
        eq(budgets.isRecurring, true),
        eq(budgets.periodType, 'monthly'),
        eq(budgets.periodStart, prevPeriodStart),
        eq(users.timezone, tz),
      ),
    );
  if (templates.length === 0) return 0;

  const inserted = await tx
    .insert(budgets)
    .values(
      templates.map((t) => ({
        id: uuidv7(),
        userId: t.userId,
        categoryId: t.categoryId,
        amount: t.amount,
        periodType: 'monthly' as const,
        periodStart: newStart,
        periodEnd: newEnd,
        isRecurring: true,
        createdBy: t.createdBy,
      })),
    )
    .onConflictDoNothing({
      target: [budgets.userId, budgets.categoryId, budgets.periodStart],
      where: sql`${budgets.userId} IS NOT NULL`,
    })
    .returning({ id: budgets.id });

  return inserted.length;
}

async function materializeHouseholdForTimezone(
  tx: TransactionClient,
  tz: string,
  now: Date,
): Promise<number> {
  const newPeriod = resolveNewPeriodIfFirstOfMonth(tz, now);
  if (!newPeriod) return 0;

  const prevPeriodStart = `${shiftPeriod(newPeriod, -1)}-01`;
  const { from: newStart, to: newEnd } = periodDateRange(newPeriod);

  const templates = await tx
    .select({
      householdId: budgets.householdId,
      categoryKey: budgets.categoryKey,
      amount: budgets.amount,
      createdBy: budgets.createdBy,
    })
    .from(budgets)
    .innerJoin(households, eq(households.id, budgets.householdId))
    .where(
      and(
        isNotNull(budgets.householdId),
        eq(budgets.isRecurring, true),
        eq(budgets.periodType, 'monthly'),
        eq(budgets.periodStart, prevPeriodStart),
        eq(households.timezone, tz),
      ),
    );
  if (templates.length === 0) return 0;

  const inserted = await tx
    .insert(budgets)
    .values(
      templates.map((t) => ({
        id: uuidv7(),
        householdId: t.householdId,
        categoryKey: t.categoryKey,
        amount: t.amount,
        periodType: 'monthly' as const,
        periodStart: newStart,
        periodEnd: newEnd,
        isRecurring: true,
        createdBy: t.createdBy,
      })),
    )
    .onConflictDoNothing({
      target: [budgets.householdId, budgets.categoryKey, budgets.periodStart],
      where: sql`${budgets.householdId} IS NOT NULL`,
    })
    .returning({ id: budgets.id });

  return inserted.length;
}
