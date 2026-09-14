/**
 * Deposits service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3. tasks/17-assets-deposits.
 *
 * `assets` holds the shared row (name, status, cached_value,
 * exclude_from_household); `deposits` holds the type-specific terms and
 * links back via `asset_id`. `createDeposit` always inserts BOTH in the
 * SAME transaction — an `assets` row with no matching `deposits` row (or
 * vice versa) should never be observable.
 *
 * ## `assets.cached_value` discipline
 *
 * Kept in sync with EXACTLY the same rule `getTotalDepositValue`
 * (src/features/assets/deposits/queries.ts) uses for the net-worth total —
 * `status = 'active'` contributes `principal`, anything else contributes 0:
 *   - create (funded or not): `cachedValue = principal`, asset `active`.
 *   - matures WITHOUT rolling over: `cachedValue = 0`. The money is still
 *     real (docs/03 §11.3: "hilang dari net worth padahal dananya masih
 *     ada" is the explicit, accepted cost of skipping ARO), but the asset
 *     row stays `active` (only withdrawal disposes it) so the user can
 *     still find and withdraw it.
 *   - matures AND rolls over (ARO): old asset's `cachedValue = 0` (its
 *     value has fully moved to the successor's own new asset row) — if it
 *     stayed at `principal` here, a naive "sum every active asset" query
 *     would double-count the same money under two asset ids.
 *   - withdrawn: asset `disposed`, `cachedValue = 0`.
 * This module's OWN net-worth-facing total never actually reads
 * `cached_value` (it sums `deposits.principal WHERE status = 'active'`
 * directly, matching docs/03 §14.1's formula word for word) — this
 * discipline is upkeep for whatever future generic cross-asset-type view
 * reads `assets.cached_value` directly, per that column's own doc comment
 * in src/lib/db/schema/assets.ts.
 *
 * ## Idempotency (spec.md, todo.md)
 *
 * `createDeposit` / `withdrawDeposit` each have their OWN unique
 * `(user_id, ...idempotency_key)` index (see src/lib/db/schema/assets.ts's
 * doc comment on why withdrawal needs a SEPARATE column from creation's).
 * `processMaturities` / `payMonthlyInterest` (the cron jobs) are idempotent
 * a different way — guarded entirely by CURRENT ROW STATE
 * (`WHERE status = 'active'`, `WHERE ... last_interest_payment_date``),
 * the same discipline `src/lib/services/invitations.ts`'s
 * `expireInvitations` uses: calling either twice in a row finds nothing
 * left to do the second time, no key required.
 */
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { dbRead } from '@/lib/db/read';
import { assets, deposits, ledgerEntries, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import { accruedInterest, shouldApplyTax, type DepositSnapshot } from '@/lib/finance/deposit';
import type { Money } from '@/lib/finance/money';
import { toLocalDate } from '@/lib/date/timezone';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type DepositRow = typeof deposits.$inferSelect;

const DEPOSIT_IDEMPOTENCY_CONSTRAINT = 'deposits_idempotency_uniq';
const WITHDRAWAL_IDEMPOTENCY_CONSTRAINT = 'deposits_withdrawal_idempotency_uniq';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 100;
/** Flat 30 days, matching src/lib/finance/savings.ts's own "average month"
 * pragmatism (that file uses 30.44; a flat 30 is used here instead because
 * it keeps the cron's due/not-due boundary an exact integer day count,
 * simpler to assert in an integration test than a fractional one). */
const MIN_DAYS_BETWEEN_MONTHLY_INTEREST = 30;

/** Same shape as src/lib/services/savings.ts's identically-named helper —
 * Drizzle wraps the raw pg-wire error (which carries `.code`/`.constraint`)
 * in a `DrizzleQueryError`, exposed as `.cause`. */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint?: string; cause?: unknown } | null;
  if (!pgErr || typeof pgErr !== 'object') return false;
  if (pgErr.code === '23505' && pgErr.constraint === constraintName) return true;
  return pgErr.cause !== undefined && isUniqueViolation(pgErr.cause, constraintName);
}

// ---- date helpers: DB DATE columns are plain `YYYY-MM-DD` strings (no
// Drizzle `mode` override — see src/lib/finance/savings.ts's file header
// for why); src/lib/finance/deposit.ts's pure functions take `Date` at UTC
// midnight. These convert at the boundary; nothing above this module ever
// sees a raw string date or does its own date arithmetic. ----

function dateStringToUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function utcToDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const d = dateStringToUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return utcToDateString(d);
}

function daysBetweenDateStrings(fromStr: string, toStr: string): number {
  return Math.round((dateStringToUtc(toStr).getTime() - dateStringToUtc(fromStr).getTime()) / 86_400_000);
}

/** DB row → the plain shape src/lib/finance/deposit.ts's pure functions
 * take. `interestRateAnnual`/`taxRate` are NUMERIC columns (Drizzle → string,
 * docs/03 §3) converted to `number` HERE ONLY, immediately before a
 * calculation — never stored or round-tripped back as a float (this
 * module's callers always write the ORIGINAL validated decimal string back
 * to the DB, never a recomputed `Number(...).toString()`). */
function toSnapshot(row: DepositRow): DepositSnapshot {
  return {
    principal: row.principal,
    interestRateAnnual: Number(row.interestRateAnnual),
    taxRate: Number(row.taxRate),
    startDate: dateStringToUtc(row.startDate),
    maturityDate: dateStringToUtc(row.maturityDate),
    payoutSchedule: row.payoutSchedule,
    lastInterestPaymentDate: row.lastInterestPaymentDate ? dateStringToUtc(row.lastInterestPaymentDate) : null,
  };
}

function assertPositivePrincipal(principal: Money): void {
  if (principal <= 0n) {
    throw new ValidationError({ principal: ['Pokok harus lebih dari Rp0'] });
  }
}

function assertBankName(bankName: string): void {
  if (bankName.trim().length === 0) {
    throw new ValidationError({ bankName: ['Nama bank wajib diisi'] });
  }
}

function assertValidRate(rateStr: string): void {
  const n = Number(rateStr);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError({ interestRateAnnual: ['Suku bunga harus antara 0 dan 100'] });
  }
}

function assertValidDates(startDate: string, maturityDate: string): void {
  // Plain string comparison is safe and correct for zero-padded YYYY-MM-DD.
  if (maturityDate <= startDate) {
    throw new ValidationError({ maturityDate: ['Tanggal jatuh tempo harus setelah tanggal mulai'] });
  }
}

/** `monthly` has nowhere to pay interest without a linked wallet — enforced
 * here (not just left to naturally do nothing at cron time) so the failure
 * is a clear validation message at creation, not a silently-skipped
 * interest payment discovered months later. */
function assertMonthlyScheduleHasWallet(payoutSchedule: 'at_maturity' | 'monthly', walletId: string | null): void {
  if (payoutSchedule === 'monthly' && !walletId) {
    throw new ValidationError({ walletId: ['Jadwal bulanan memerlukan dompet tujuan bunga'] });
  }
}

/** Same guard shape as src/lib/services/savings.ts's identically-named
 * helper — a deposit's source/destination wallet must belong to the caller
 * and be active. */
async function assertWalletOwnedAndActive(tx: TransactionClient, userId: string, walletId: string): Promise<void> {
  const [wallet] = await tx
    .select({ id: wallets.id, isArchived: wallets.isArchived })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), ownedBy(wallets, userId)))
    .limit(1);

  if (!wallet) {
    throw new ValidationError({ walletId: ['Dompet tidak ditemukan'] });
  }
  if (wallet.isArchived) {
    throw new ValidationError({ walletId: ['Dompet yang diarsipkan tidak bisa dipakai'] });
  }
}

async function fetchOwnedDepositOrThrow(tx: TransactionClient, userId: string, depositId: string): Promise<DepositRow> {
  const [deposit] = await tx
    .select()
    .from(deposits)
    .where(and(eq(deposits.id, depositId), ownedBy(deposits, userId)))
    .limit(1);
  if (!deposit) throw new NotFoundError('Deposito tidak ditemukan');
  return deposit;
}

// ============================================================================
// Create / update
// ============================================================================

export interface CreateDepositInput {
  bankName: string;
  principal: Money;
  /** Decimal string, e.g. `"4.2500"` — validated shape at the Zod boundary,
   * passed through to the DB verbatim (never round-tripped through
   * `Number`) except for the transient conversion inside
   * `calculateDepositInterest`. */
  interestRateAnnual: string;
  startDate: string; // YYYY-MM-DD
  maturityDate: string; // YYYY-MM-DD
  payoutSchedule: 'at_maturity' | 'monthly';
  aroEnabled: boolean;
  aroIncludeInterest: boolean;
  /** `null` => recording a deposit not funded through the app (no ledger
   * entry, no monthly-interest destination). Required when
   * `payoutSchedule === 'monthly'`. */
  walletId: string | null;
  idempotencyKey: string;
}

/**
 * One transaction: INSERT `assets` + `deposits`, and — only when
 * `walletId` is given — a `deposit_placement` ledger entry decreasing that
 * wallet by `principal` (todo.md: "INSERT asset + deposit + ledger entry
 * BILA didanai dompet"). `tax_rate` is ALWAYS derived here via
 * `shouldApplyTax`, never accepted as caller input — spec.md's "Tanya
 * dulu: mengubah ambang pajak" treats the threshold itself as fixed, and
 * there's no legitimate reason for a per-deposit override of Indonesia's
 * flat PPh final rate.
 *
 * Idempotent on `idempotencyKey`: a retried call with the SAME key hits
 * `deposits_idempotency_uniq`, rolls the whole transaction back (so no
 * duplicate asset/ledger entry survives), and the catch below returns the
 * ORIGINAL row instead of raising an error.
 */
export async function createDeposit(userId: string, input: CreateDepositInput): Promise<DepositRow> {
  assertBankName(input.bankName);
  assertPositivePrincipal(input.principal);
  assertValidRate(input.interestRateAnnual);
  assertValidDates(input.startDate, input.maturityDate);
  assertMonthlyScheduleHasWallet(input.payoutSchedule, input.walletId);

  const taxRate = shouldApplyTax(input.principal) ? '0.2000' : '0.0000';

  try {
    return await dbWrite.transaction(async (tx) => {
      if (input.walletId) {
        await assertWalletOwnedAndActive(tx, userId, input.walletId);
      }

      const assetId = uuidv7();
      await tx.insert(assets).values({
        id: assetId,
        userId,
        name: `Deposito ${input.bankName}`,
        assetType: 'deposit',
        status: 'active',
        cachedValue: input.principal,
        cachedAt: new Date(),
      });

      const depositId = uuidv7();
      const [deposit] = await tx
        .insert(deposits)
        .values({
          id: depositId,
          assetId,
          userId,
          bankName: input.bankName,
          principal: input.principal,
          interestRateAnnual: input.interestRateAnnual,
          taxRate,
          startDate: input.startDate,
          maturityDate: input.maturityDate,
          payoutSchedule: input.payoutSchedule,
          aroEnabled: input.aroEnabled,
          aroIncludeInterest: input.aroIncludeInterest,
          status: 'active',
          walletId: input.walletId,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      if (input.walletId) {
        await postEntries(tx, [
          {
            userId,
            walletId: input.walletId,
            amount: -input.principal, // money OUT of the funding wallet
            source: 'deposit_placement',
            entryDate: dateStringToUtc(input.startDate),
            sourceId: depositId,
          },
        ]);
      }

      return deposit!;
    });
  } catch (err) {
    if (isUniqueViolation(err, DEPOSIT_IDEMPOTENCY_CONSTRAINT)) {
      const [existing] = await dbWrite
        .select()
        .from(deposits)
        .where(and(eq(deposits.userId, userId), eq(deposits.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (existing) return existing;
    }
    throw err;
  }
}

export interface UpdateDepositInput {
  bankName: string;
  interestRateAnnual: string;
  maturityDate: string;
  payoutSchedule: 'at_maturity' | 'monthly';
  aroEnabled: boolean;
  aroIncludeInterest: boolean;
}

/**
 * Edits the terms of an ACTIVE deposit only — `principal`, `startDate`, and
 * `walletId` are locked for life (like a wallet's `type` after creation):
 * changing the funded amount or funding source after the fact would desync
 * the deposit from the ledger entry that was actually posted for it.
 */
export async function updateDeposit(userId: string, depositId: string, input: UpdateDepositInput): Promise<DepositRow> {
  assertBankName(input.bankName);
  assertValidRate(input.interestRateAnnual);

  return dbWrite.transaction(async (tx) => {
    const existing = await fetchOwnedDepositOrThrow(tx, userId, depositId);
    if (existing.status !== 'active') {
      throw new ValidationError({ status: ['Hanya deposito aktif yang dapat diubah'] });
    }
    assertValidDates(existing.startDate, input.maturityDate);
    if (input.payoutSchedule === 'monthly' && !existing.walletId) {
      throw new ValidationError({
        walletId: ['Jadwal bulanan memerlukan dompet tujuan bunga, yang hanya dapat diatur saat pembuatan'],
      });
    }

    const [updated] = await tx
      .update(deposits)
      .set({
        bankName: input.bankName,
        interestRateAnnual: input.interestRateAnnual,
        maturityDate: input.maturityDate,
        payoutSchedule: input.payoutSchedule,
        aroEnabled: input.aroEnabled,
        aroIncludeInterest: input.aroIncludeInterest,
        updatedAt: new Date(),
      })
      .where(eq(deposits.id, depositId))
      .returning();

    // Keep the shared asset row's display name in sync — it's derived
    // purely from bankName at creation (this module's own convention).
    await tx.update(assets).set({ name: `Deposito ${input.bankName}`, updatedAt: new Date() }).where(eq(assets.id, existing.assetId));

    return updated!;
  });
}

// ============================================================================
// Withdraw
// ============================================================================

export interface WithdrawDepositInput {
  /** Destination for principal + net interest. Independent of whatever
   * `walletId` (if any) funded the deposit at creation — a pre-existing
   * deposit recorded with no funding wallet still needs somewhere to send
   * the payout. */
  walletId: string;
  withdrawalDate: Date;
  idempotencyKey: string;
}

export interface WithdrawDepositResult {
  deposit: DepositRow;
  ledgerEntryId: string;
  principal: Money;
  netInterest: Money;
  totalCredited: Money;
}

async function buildAlreadyWithdrawnResult(tx: TransactionClient, deposit: DepositRow): Promise<WithdrawDepositResult> {
  const [entry] = await tx
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.source, 'deposit_withdrawal'), eq(ledgerEntries.sourceId, deposit.id)))
    .limit(1);
  if (!entry) {
    // Should be unreachable: `withdrawalIdempotencyKey` is only ever set in
    // the SAME transaction that posts this exact ledger entry, below.
    throw new Error(`withdrawDeposit: deposit ${deposit.id} is withdrawn but its ledger entry is missing`);
  }
  return {
    deposit,
    ledgerEntryId: entry.id,
    principal: deposit.principal,
    netInterest: entry.amount - deposit.principal,
    totalCredited: entry.amount,
  };
}

/**
 * Withdraws principal + net interest accrued up to `withdrawalDate` (capped
 * at `maturityDate` — no bonus for cashing out late) or since
 * `lastInterestPaymentDate` for a `monthly` deposit (so months already
 * credited are never paid a second time here). One ledger entry, one
 * status flip to `withdrawn`, asset `disposed`.
 *
 * Allowed from BOTH `active` (early withdrawal — spec.md's explicit
 * "penalti pencairan dini... dicatat manual bila terjadi": this function
 * never shrinks the payout for being early, it only warns the caller in
 * the UI) and `matured` (claiming funds the maturity cron already flagged
 * but nothing has rolled over or been withdrawn yet).
 *
 * Idempotent on `idempotencyKey`, via `deposits.withdrawal_idempotency_key`
 * (a column separate from creation's — see its schema comment): a retry
 * with the SAME key against an already-withdrawn deposit returns the
 * ORIGINAL result; a call against an already-withdrawn deposit with a
 * DIFFERENT key (or none matching) is a genuine conflict and throws.
 */
export async function withdrawDeposit(
  userId: string,
  depositId: string,
  input: WithdrawDepositInput,
): Promise<WithdrawDepositResult> {
  try {
    return await dbWrite.transaction(async (tx) => {
      const existing = await fetchOwnedDepositOrThrow(tx, userId, depositId);

      if (existing.status !== 'active' && existing.status !== 'matured') {
        if (existing.withdrawalIdempotencyKey === input.idempotencyKey) {
          return await buildAlreadyWithdrawnResult(tx, existing);
        }
        throw new ValidationError({ status: ['Deposito ini sudah dicairkan'] });
      }

      await assertWalletOwnedAndActive(tx, userId, input.walletId);

      const netInterest = accruedInterest(toSnapshot(existing), input.withdrawalDate);
      const totalCredited = existing.principal + netInterest;

      const [updated] = await tx
        .update(deposits)
        .set({ status: 'withdrawn', withdrawalIdempotencyKey: input.idempotencyKey, updatedAt: new Date() })
        .where(and(eq(deposits.id, depositId), sql`${deposits.status} IN ('active', 'matured')`))
        .returning();

      if (!updated) {
        // Lost a race with a concurrent withdrawal between the read above
        // and this UPDATE — re-check with fresh state rather than assume
        // failure.
        const [fresh] = await tx.select().from(deposits).where(eq(deposits.id, depositId)).limit(1);
        if (fresh && fresh.withdrawalIdempotencyKey === input.idempotencyKey) {
          return await buildAlreadyWithdrawnResult(tx, fresh);
        }
        throw new ValidationError({ status: ['Deposito ini sudah dicairkan'] });
      }

      const [entry] = await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: totalCredited, // money IN: principal + bunga bersih
          source: 'deposit_withdrawal',
          entryDate: input.withdrawalDate,
          sourceId: depositId,
        },
      ]);

      await tx
        .update(assets)
        .set({ status: 'disposed', cachedValue: 0n, cachedAt: new Date() })
        .where(eq(assets.id, existing.assetId));

      return {
        deposit: updated,
        ledgerEntryId: entry!.id,
        principal: existing.principal,
        netInterest,
        totalCredited,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err, WITHDRAWAL_IDEMPOTENCY_CONSTRAINT)) {
      const [existing] = await dbWrite
        .select()
        .from(deposits)
        .where(and(eq(deposits.userId, userId), eq(deposits.withdrawalIdempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (existing) return dbWrite.transaction((tx) => buildAlreadyWithdrawnResult(tx, existing));
    }
    throw err;
  }
}

// ============================================================================
// Cron: maturity + ARO
// ============================================================================

/**
 * ARO successor — docs/03 §11.3, spec.md. Principal carries forward as-is,
 * or plus the settlement's net interest when `aroIncludeInterest`. The new
 * term is the SAME LENGTH as the one that just matured, starting the day
 * it matured. `rolledFromId` links back to `old.id`.
 *
 * When `aroIncludeInterest` is false, the settlement interest doesn't just
 * vanish — real earned money is never silently dropped in this app (the
 * opposite failure mode from ADR-013, but just as much a "small lie"): it's
 * credited to `old.walletId` as a `deposit_interest` ledger entry, same as
 * a monthly payout. If there's no linked wallet to credit (a deposit
 * recorded without one), it's folded into the successor's principal
 * instead — the only place that money COULD go without inventing a wallet
 * reference.
 */
async function createRolloverSuccessor(tx: TransactionClient, old: DepositRow, settlementNetInterest: Money): Promise<DepositRow> {
  const tenorDays = daysBetweenDateStrings(old.startDate, old.maturityDate);
  const newStartDate = old.maturityDate;
  const newMaturityDate = shiftDateString(old.maturityDate, tenorDays);

  let newPrincipal = old.principal;
  let interestPayout = 0n;
  if (settlementNetInterest > 0n) {
    if (old.aroIncludeInterest) {
      newPrincipal = old.principal + settlementNetInterest;
    } else if (old.walletId) {
      interestPayout = settlementNetInterest;
    } else {
      newPrincipal = old.principal + settlementNetInterest; // nowhere else for it to go
    }
  }

  const newAssetId = uuidv7();
  await tx.insert(assets).values({
    id: newAssetId,
    userId: old.userId,
    name: `Deposito ${old.bankName}`,
    assetType: 'deposit',
    status: 'active',
    cachedValue: newPrincipal,
    cachedAt: new Date(),
  });

  const [successor] = await tx
    .insert(deposits)
    .values({
      id: uuidv7(),
      assetId: newAssetId,
      userId: old.userId,
      bankName: old.bankName,
      principal: newPrincipal,
      interestRateAnnual: old.interestRateAnnual,
      taxRate: old.taxRate,
      startDate: newStartDate,
      maturityDate: newMaturityDate,
      payoutSchedule: old.payoutSchedule,
      aroEnabled: old.aroEnabled,
      aroIncludeInterest: old.aroIncludeInterest,
      status: 'active',
      walletId: old.walletId,
      rolledFromId: old.id,
    })
    .returning();

  if (interestPayout > 0n && old.walletId) {
    await postEntries(tx, [
      {
        userId: old.userId,
        walletId: old.walletId,
        amount: interestPayout,
        source: 'deposit_interest',
        entryDate: dateStringToUtc(old.maturityDate),
        sourceId: old.id,
      },
    ]);
  }

  return successor!;
}

/**
 * One deposit's maturity transition, in its OWN transaction — so one bad
 * row can never roll back an entire cron batch. Guarded by
 * `WHERE status = 'active' AND maturity_date <= :todayStr`: a second call
 * for the same deposit (retry, overlapping cron run) finds 0 rows, changes
 * nothing, and creates no second ARO successor — the whole reason ARO
 * creation happens INSIDE this same guarded transaction rather than as a
 * separate step.
 */
async function processOneMaturity(depositId: string, todayStr: string): Promise<{ matured: boolean; rolled: boolean }> {
  return dbWrite.transaction(async (tx) => {
    const [updated] = await tx
      .update(deposits)
      .set({ status: 'matured', updatedAt: new Date() })
      .where(and(eq(deposits.id, depositId), eq(deposits.status, 'active'), lte(deposits.maturityDate, todayStr)))
      .returning();

    if (!updated) return { matured: false, rolled: false }; // already processed — idempotent no-op

    // Asset stays `active` (only withdrawal disposes it — the money is
    // still real, just not `active`-deposit-shaped) but its cache drops to
    // 0 — see this module's file header on why.
    await tx.update(assets).set({ cachedValue: 0n, cachedAt: new Date() }).where(eq(assets.id, updated.assetId));

    if (!updated.aroEnabled) {
      return { matured: true, rolled: false };
    }

    const settlementNetInterest = accruedInterest(toSnapshot(updated), dateStringToUtc(updated.maturityDate));
    await createRolloverSuccessor(tx, updated, settlementNetInterest);
    return { matured: true, rolled: true };
  });
}

export interface ProcessMaturitiesResult {
  maturedCount: number;
  aroCount: number;
}

/**
 * Cron entry point for `/api/cron/deposit-maturity` — `active` deposits
 * whose `maturity_date` has passed become `matured`, and `aro_enabled` ones
 * get an automatic successor. Processed in batches of `batchSize` with a
 * keyset cursor on `id` (todo.md: "Proses per batch dengan cursor"), each
 * deposit in its own transaction (see `processOneMaturity`).
 */
export async function processMaturities(today: Date = new Date(), batchSize = BATCH_SIZE): Promise<ProcessMaturitiesResult> {
  const todayStr = toLocalDate(today);
  let maturedCount = 0;
  let aroCount = 0;
  let cursor = ZERO_UUID;

  for (;;) {
    const batch = await dbRead
      .select({ id: deposits.id })
      .from(deposits)
      .where(and(eq(deposits.status, 'active'), lte(deposits.maturityDate, todayStr), gt(deposits.id, cursor)))
      .orderBy(asc(deposits.id))
      .limit(batchSize);

    if (batch.length === 0) break;

    for (const row of batch) {
      const result = await processOneMaturity(row.id, todayStr);
      if (result.matured) maturedCount++;
      if (result.rolled) aroCount++;
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return { maturedCount, aroCount };
}

// ============================================================================
// Cron: monthly interest
// ============================================================================

/**
 * One `monthly` deposit's interest credit, in its OWN transaction. Re-checks
 * every guard freshly INSIDE the transaction (status, schedule, due date)
 * rather than trusting the batch-selection query — the same defensive
 * shape `processOneMaturity` uses, needed here because the candidate query
 * runs on `dbRead` slightly before this transaction opens.
 *
 * Guarded by `last_interest_payment_date` (or `start_date` if never paid):
 * advancing it to `todayStr` at the end of a successful run means a second
 * call the same day (or before the next ~30 days elapse) finds this
 * deposit no longer due, and does nothing — todo.md: "bunga bulanan
 * dikreditkan sekali per bulan."
 */
async function processOneMonthlyInterest(depositId: string, todayStr: string): Promise<boolean> {
  return dbWrite.transaction(async (tx) => {
    const [deposit] = await tx.select().from(deposits).where(eq(deposits.id, depositId)).limit(1);
    if (!deposit) return false;
    if (deposit.status !== 'active' || deposit.payoutSchedule !== 'monthly' || !deposit.walletId) return false;

    const periodStartStr = deposit.lastInterestPaymentDate ?? deposit.startDate;
    if (daysBetweenDateStrings(periodStartStr, todayStr) < MIN_DAYS_BETWEEN_MONTHLY_INTEREST) return false;

    const netInterest = accruedInterest(toSnapshot(deposit), dateStringToUtc(todayStr));
    if (netInterest <= 0n) {
      // Nothing to pay (e.g. this "month" landed exactly on start) — still
      // advance the cursor so this row isn't re-evaluated on every future
      // run until another full period has genuinely elapsed.
      await tx.update(deposits).set({ lastInterestPaymentDate: todayStr, updatedAt: new Date() }).where(eq(deposits.id, depositId));
      return false;
    }

    await postEntries(tx, [
      {
        userId: deposit.userId,
        walletId: deposit.walletId,
        amount: netInterest,
        source: 'deposit_interest',
        entryDate: dateStringToUtc(todayStr),
        sourceId: depositId,
      },
    ]);
    await tx.update(deposits).set({ lastInterestPaymentDate: todayStr, updatedAt: new Date() }).where(eq(deposits.id, depositId));

    return true;
  });
}

export interface PayMonthlyInterestResult {
  paidCount: number;
}

/** Cron entry point for `/api/cron/deposit-maturity` — every `active`,
 * `payout_schedule = 'monthly'` deposit at least `MIN_DAYS_BETWEEN_MONTHLY_INTEREST`
 * past its last payment (or `start_date`, if never paid) gets one net-interest
 * credit to its linked wallet. Same batched-cursor shape as `processMaturities`. */
export async function payMonthlyInterest(today: Date = new Date(), batchSize = BATCH_SIZE): Promise<PayMonthlyInterestResult> {
  const todayStr = toLocalDate(today);
  const cutoffStr = shiftDateString(todayStr, -MIN_DAYS_BETWEEN_MONTHLY_INTEREST);
  let paidCount = 0;
  let cursor = ZERO_UUID;

  for (;;) {
    const batch = await dbRead
      .select({ id: deposits.id })
      .from(deposits)
      .where(
        and(
          eq(deposits.status, 'active'),
          eq(deposits.payoutSchedule, 'monthly'),
          gt(deposits.id, cursor),
          sql`COALESCE(${deposits.lastInterestPaymentDate}, ${deposits.startDate}) <= ${cutoffStr}`,
        ),
      )
      .orderBy(asc(deposits.id))
      .limit(batchSize);

    if (batch.length === 0) break;

    for (const row of batch) {
      const paid = await processOneMonthlyInterest(row.id, todayStr);
      if (paid) paidCount++;
    }

    cursor = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return { paidCount };
}

// Re-exported for query/UI layers that need to turn a DB row into the
// pure-math snapshot without duplicating the parsing logic above.
export { toSnapshot as depositRowToSnapshot };
