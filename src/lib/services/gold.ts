/**
 * Gold holdings service — dbWrite transactions live here, per
 * docs/11-tech-architecture.md §3 (only src/lib/services/** may import
 * `@/lib/db/write`). docs/03-domain-model.md §11.2, ADR-007, ADR-008.
 *
 * `buyGold`/`sellGold` follow the exact same "ledger-entry-only, no
 * `transactions` row" shape as src/lib/services/savings.ts's
 * `contribute`/`withdraw` (see that file's own header for the full
 * reasoning) — a purchase/sale is linked back via
 * `ledger_entries.source` (`gold_purchase` / `gold_sale`) +
 * `source_id` = the lot/sale row's own id, the same polymorphic-id shape
 * `ledger_entries.sourceId`'s comment reserves for exactly this. Because of
 * that shape, `gold_lots`/`gold_sales` need their OWN `idempotency_key`
 * column (added in this task — see src/lib/db/schema/assets.ts's file
 * header "Deviation" note) instead of relying on `transactions.idempotency_key`.
 *
 * `sellGold` takes `SELECT ... FOR UPDATE` on every lot row belonging to
 * the caller's gold asset BEFORE checking "does gramsSold exceed what's
 * available" — this is what makes that check airtight under concurrency,
 * the same reasoning src/lib/services/savings.ts's `withdraw` gives for
 * locking the goal row (docs/06-api-contracts.md §8's own worked example is
 * this exact shape, for debts). A concurrent `buyGold` racing in only ever
 * RAISES what's available, so `buyGold` itself doesn't need this lock.
 */
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbRead } from '@/lib/db/read';
import { dbWrite } from '@/lib/db/write';
import { assets, goldLots, goldPrices, goldSales, wallets } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import { postEntries } from '@/lib/finance/ledger';
import { type Money } from '@/lib/finance/money';
import {
  computeSale,
  formatGramsForDb,
  formatGramsDisplay,
  gramsToMoney,
  parseGrams,
  totalRemainingGrams,
  type Grams,
} from '@/lib/finance/gold';
import { fetchGoldPriceWithFallback, type GoldPriceProviderId, getConfiguredProviderId } from '@/lib/gold-price/provider';
import { ValidationError } from '@/lib/api/errors';
import type { TransactionClient } from '@/lib/db';

export type GoldAssetRow = typeof assets.$inferSelect;
export type GoldLotRow = typeof goldLots.$inferSelect;
export type GoldSaleRow = typeof goldSales.$inferSelect;
export type GoldPriceRow = typeof goldPrices.$inferSelect;

const LOT_IDEMPOTENCY_CONSTRAINT = 'gl_idempotency_uniq';
const SALE_IDEMPOTENCY_CONSTRAINT = 'gs_idempotency_uniq';

// Same generous window as src/lib/services/savings.ts / transactions.ts —
// absorbs client/server clock skew without resolving the caller's local
// "tomorrow" here.
const MAX_FUTURE_DAYS = 2;

/** `gold_lots.purchase_date` / `gold_sales.sale_date` are `date` columns
 * (no time-of-day), which Drizzle reads/writes as a plain `YYYY-MM-DD`
 * string (same "NUMERIC/DATE -> string" mapping as `savings_goals.target_date`
 * — ADR-002) — unlike `ledger_entries.entry_date`, a `timestamp` column
 * that DOES accept a `Date` directly. Callers pass a `Date` (matching the
 * rest of this codebase's action-layer convention of `z.coerce.date()`),
 * so every insert into one of those two columns converts here. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when `err` is a Postgres unique-violation (23505) on `constraintName` —
 * docs/05-financial-integrity.md §6. Duplicated locally rather than shared,
 * matching every other service in this codebase (savings.ts, transfers.ts
 * each keep their own copy). */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint?: string; cause?: unknown } | null;
  if (!pgErr || typeof pgErr !== 'object') return false;
  if (pgErr.code === '23505' && pgErr.constraint === constraintName) return true;
  return pgErr.cause !== undefined && isUniqueViolation(pgErr.cause, constraintName);
}

function assertPositiveMoney(amount: Money, field: string): void {
  if (amount <= 0n) {
    throw new ValidationError({ [field]: ['Harga harus lebih dari Rp0'] });
  }
}

function assertPositiveGrams(raw: string): Grams {
  let grams: Grams;
  try {
    grams = parseGrams(raw);
  } catch {
    throw new ValidationError({ weightGrams: ['Berat tidak valid'] });
  }
  if (grams <= 0n) {
    throw new ValidationError({ weightGrams: ['Berat harus lebih dari 0 gram'] });
  }
  return grams;
}

function assertNotTooFarInFuture(date: Date, field: string): void {
  const limit = new Date();
  limit.setDate(limit.getDate() + MAX_FUTURE_DAYS);
  if (date.getTime() > limit.getTime()) {
    throw new ValidationError({ [field]: ['Tanggal tidak valid'] });
  }
}

function assertBuybackLteSell(sellPerGram: Money, buybackPerGram: Money): void {
  if (sellPerGram <= 0n || buybackPerGram <= 0n) {
    throw new ValidationError({ buybackPerGram: ['Harga harus lebih dari Rp0'] });
  }
  if (buybackPerGram > sellPerGram) {
    throw new ValidationError({ buybackPerGram: ['Harga buyback tidak boleh melebihi harga jual'] });
  }
}

/** Verifies the wallet belongs to `userId` AND is active — same guard shape
 * as src/lib/services/savings.ts's `assertWalletOwnedAndActive`. */
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

/**
 * Finds the caller's one-and-only gold asset row, creating it (status
 * `active`) if this is their first purchase ever — todo.md: "INSERT asset
 * (bila belum ada) + lot". Every subsequent purchase/sale reuses the SAME
 * asset row; `gold_lots`/`gold_sales` scope by `user_id` directly, so
 * nothing besides `cached_value` bookkeeping actually depends on there
 * being exactly one row, but keeping it singular is what makes "Emas" one
 * coherent section instead of an arbitrary list of assets.
 *
 * Known limitation: this is a plain check-then-insert, not guarded by a
 * unique constraint or advisory lock. Two literally-concurrent FIRST
 * purchases for the same brand-new user (two tabs racing, not a single
 * double-tap — the buy sheet's submit button self-disables via `Button`'s
 * `loading` prop the moment one request is in flight) could each see "no
 * asset yet" and insert two rows; `getGoldAsset`'s `.limit(1)` would then
 * arbitrarily surface only one of them, leaving the other's lots
 * technically intact but invisible to every read in ./queries.ts. Fixing
 * this properly needs either a partial unique index on `assets (user_id)
 * WHERE asset_type = 'gold'` (a schema change beyond this task's scope) or
 * a `pg_advisory_xact_lock`. Left as a documented gap rather than either,
 * given how narrow the race window is for a single-user personal finance
 * app — flagged here so it isn't rediscovered as a mystery bug later.
 */
async function findOrCreateGoldAsset(tx: TransactionClient, userId: string): Promise<GoldAssetRow> {
  const [existing] = await tx
    .select()
    .from(assets)
    .where(and(ownedBy(assets, userId), eq(assets.assetType, 'gold')))
    .limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(assets)
    .values({ id: uuidv7(), userId, name: 'Emas', assetType: 'gold', status: 'active' })
    .returning();
  return created!;
}

/**
 * Recomputes `assets.cached_value` from the CURRENT `gold_lots` +
 * `gold_prices` state — called at the end of `buyGold`, `sellGold`, AND
 * `recordGoldPrice` (a price update alone changes the valuation even
 * though no gram changed hands — the task's own worked example: "beli →
 * saldo turun → update harga → gain berubah → jual"). Uses the buyback
 * price ONLY (ADR-007) — if no price has EVER been recorded for this user,
 * `cached_value` is left at `0`, matching "Belum ada harga sama sekali →
 * valuasi disembunyikan" (the UI hides valuation rather than showing a
 * misleading 0, but the cache itself has to hold SOME value, and 0 is the
 * honest one: unpriced holdings contribute nothing knowable to net worth).
 */
async function recalculateCachedValue(tx: TransactionClient, userId: string, assetId: string): Promise<void> {
  const lots = await tx
    .select({ remainingGrams: goldLots.remainingGrams })
    .from(goldLots)
    .where(and(eq(goldLots.assetId, assetId), sql`${goldLots.remainingGrams} > 0`));
  const totalGrams = totalRemainingGrams(lots.map((l) => ({ remainingGrams: parseGrams(l.remainingGrams) })));

  const [latestPrice] = await tx
    .select({ buybackPricePerGram: goldPrices.buybackPricePerGram })
    .from(goldPrices)
    .where(ownedBy(goldPrices, userId))
    .orderBy(sql`${goldPrices.priceDate} DESC`)
    .limit(1);

  const cachedValue = latestPrice ? gramsToMoney(totalGrams, latestPrice.buybackPricePerGram) : 0n;

  await tx.update(assets).set({ cachedValue, cachedAt: new Date(), updatedAt: new Date() }).where(eq(assets.id, assetId));
}

async function findLotByIdempotencyKey(userId: string, idempotencyKey: string): Promise<GoldLotRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(goldLots)
    .where(and(eq(goldLots.userId, userId), eq(goldLots.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

async function findSaleByIdempotencyKey(userId: string, idempotencyKey: string): Promise<GoldSaleRow | undefined> {
  const [row] = await dbWrite
    .select()
    .from(goldSales)
    .where(and(eq(goldSales.userId, userId), eq(goldSales.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row;
}

export interface BuyGoldInput {
  /** Decimal grams as typed, e.g. `"10.5"` — parsed via `parseGrams`. */
  weightGrams: string;
  /** Sell (retail purchase) price per gram — what the caller actually paid. */
  pricePerGram: Money;
  /** MUST belong to the buyer — money OUT of their own wallet. */
  walletId: string;
  purchaseDate: Date;
  goldForm: string | null;
  idempotencyKey: string;
}

/**
 * Buys gold: one `dbWrite.transaction()` — find-or-create the gold asset,
 * a new `gold_lots` row, a real ledger entry DECREASING the buyer's chosen
 * wallet by `weight × price` (explicit half-up rounding via
 * src/lib/finance/gold.ts's `gramsToMoney`), and a `cached_value` refresh.
 * Acceptance criterion: "Saldo dompet turun sebesar berat × harga_beli_per_gram."
 */
export async function buyGold(userId: string, input: BuyGoldInput): Promise<GoldLotRow> {
  const grams = assertPositiveGrams(input.weightGrams);
  assertPositiveMoney(input.pricePerGram, 'pricePerGram');
  assertNotTooFarInFuture(input.purchaseDate, 'purchaseDate');

  try {
    return await dbWrite.transaction(async (tx) => {
      await assertWalletOwnedAndActive(tx, userId, input.walletId);
      const asset = await findOrCreateGoldAsset(tx, userId);

      const cost = gramsToMoney(grams, input.pricePerGram);
      const lotId = uuidv7();

      const [entry] = await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: -cost, // money OUT of the buyer's wallet
          source: 'gold_purchase',
          entryDate: input.purchaseDate,
          sourceId: lotId,
        },
      ]);

      const [lot] = await tx
        .insert(goldLots)
        .values({
          id: lotId,
          assetId: asset.id,
          userId,
          weightGrams: formatGramsForDb(grams),
          remainingGrams: formatGramsForDb(grams),
          purchasePricePerGram: input.pricePerGram,
          purchaseDate: toDateOnly(input.purchaseDate),
          goldForm: input.goldForm,
          ledgerEntryId: entry!.id,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      // A purchase can reactivate a fully-liquidated asset — nothing in
      // spec.md defines disposal semantics for gold, but leaving `status`
      // stuck at `disposed` after a fresh purchase would be visibly wrong.
      if (asset.status !== 'active') {
        await tx.update(assets).set({ status: 'active', updatedAt: new Date() }).where(eq(assets.id, asset.id));
      }

      await recalculateCachedValue(tx, userId, asset.id);

      return lot!;
    });
  } catch (err) {
    if (isUniqueViolation(err, LOT_IDEMPOTENCY_CONSTRAINT)) {
      const existing = await findLotByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }
}

export interface SellGoldInput {
  weightGrams: string;
  /** Buyback price per gram at the time of sale — what the caller actually receives. */
  pricePerGram: Money;
  /** MUST belong to the seller — money IN to their own wallet. */
  walletId: string;
  saleDate: Date;
  idempotencyKey: string;
}

/**
 * Sells gold against weighted-average cost basis: `SELECT ... FOR UPDATE`
 * on every remaining lot (this function's own file-header note on why),
 * rejects selling more than currently held, reduces `remaining_grams`
 * proportionally (src/lib/finance/gold.ts's `computeSale`), records a
 * `gold_sales` row, posts a real ledger entry INCREASING the seller's
 * chosen wallet by the proceeds, and refreshes `cached_value` — one
 * `dbWrite.transaction()`.
 */
export async function sellGold(userId: string, input: SellGoldInput): Promise<GoldSaleRow> {
  const gramsSold = assertPositiveGrams(input.weightGrams);
  assertPositiveMoney(input.pricePerGram, 'pricePerGram');
  assertNotTooFarInFuture(input.saleDate, 'saleDate');

  try {
    return await dbWrite.transaction(async (tx) => {
      await assertWalletOwnedAndActive(tx, userId, input.walletId);

      const [asset] = await tx
        .select()
        .from(assets)
        .where(and(ownedBy(assets, userId), eq(assets.assetType, 'gold')))
        .limit(1);

      // `SELECT ... FOR UPDATE` locks every remaining lot BEFORE reading
      // "how much is available" — see this file's header comment. An empty
      // result (no asset yet, or every lot already at 0) is handled the
      // same way as "not enough grams": the totalAvailable check below
      // naturally rejects with 0 available.
      const lots = asset
        ? await tx
            .select()
            .from(goldLots)
            .where(and(eq(goldLots.assetId, asset.id), sql`${goldLots.remainingGrams} > 0`))
            .for('update')
        : [];

      const lotInputs = lots.map((l) => ({
        id: l.id,
        remainingGrams: parseGrams(l.remainingGrams),
        purchasePricePerGram: l.purchasePricePerGram,
      }));
      const totalAvailable = totalRemainingGrams(lotInputs);

      if (gramsSold > totalAvailable) {
        throw new ValidationError({
          weightGrams: [`Melebihi kepemilikan emas Anda. Tersedia ${formatGramsDisplay(totalAvailable)} gram.`],
        });
      }

      const sale = computeSale(lotInputs, gramsSold, input.pricePerGram);

      for (const reduction of sale.reductions) {
        if (reduction.reduceBy === 0n) continue;
        // Relative SQL-side subtraction, never a computed-value SET — same
        // discipline src/lib/finance/ledger.ts's postEntries uses for
        // wallets.balance, applied here even though the FOR UPDATE lock
        // already makes a computed value safe: one convention for every
        // quantity mutation in this codebase, not two.
        await tx
          .update(goldLots)
          .set({ remainingGrams: sql`${goldLots.remainingGrams} - ${formatGramsForDb(reduction.reduceBy)}` })
          .where(eq(goldLots.id, reduction.lotId));
      }

      const saleId = uuidv7();
      const [entry] = await postEntries(tx, [
        {
          userId,
          walletId: input.walletId,
          amount: sale.proceeds, // money IN to the seller's wallet
          source: 'gold_sale',
          entryDate: input.saleDate,
          sourceId: saleId,
        },
      ]);

      const [saleRow] = await tx
        .insert(goldSales)
        .values({
          id: saleId,
          userId,
          assetId: asset!.id,
          weightGrams: formatGramsForDb(gramsSold),
          pricePerGram: input.pricePerGram,
          proceeds: sale.proceeds,
          costBasis: sale.costBasis,
          realizedGain: sale.realizedGain,
          saleDate: toDateOnly(input.saleDate),
          ledgerEntryId: entry!.id,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      await recalculateCachedValue(tx, userId, asset!.id);

      return saleRow!;
    });
  } catch (err) {
    if (isUniqueViolation(err, SALE_IDEMPOTENCY_CONSTRAINT)) {
      const existing = await findSaleByIdempotencyKey(userId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }
}

export interface RecordGoldPriceInput {
  /** `YYYY-MM-DD`. */
  priceDate: string;
  sellPerGram: Money;
  buybackPerGram: Money;
  source: string;
}

/**
 * Upserts today's (or a backdated) gold price for `userId` — one row per
 * (user, date), matching `gold_prices_user_date_uniq`. Also refreshes
 * `assets.cached_value` if the user already has a gold asset, since a price
 * change alone moves the valuation — todo.md's "update harga → gain
 * berubah" flow.
 */
export async function recordGoldPrice(userId: string, input: RecordGoldPriceInput): Promise<GoldPriceRow> {
  assertBuybackLteSell(input.sellPerGram, input.buybackPerGram);

  return dbWrite.transaction(async (tx) => {
    const [row] = await tx
      .insert(goldPrices)
      .values({
        id: uuidv7(),
        userId,
        priceDate: input.priceDate,
        sellPricePerGram: input.sellPerGram,
        buybackPricePerGram: input.buybackPerGram,
        source: input.source,
      })
      .onConflictDoUpdate({
        target: [goldPrices.userId, goldPrices.priceDate],
        set: {
          sellPricePerGram: input.sellPerGram,
          buybackPricePerGram: input.buybackPerGram,
          source: input.source,
        },
      })
      .returning();

    const [asset] = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(ownedBy(assets, userId), eq(assets.assetType, 'gold')))
      .limit(1);
    if (asset) {
      await recalculateCachedValue(tx, userId, asset.id);
    }

    return row!;
  });
}

export interface RefreshGoldPricesResult {
  /** Users whose price was refreshed via a successful external fetch. */
  refreshedCount: number;
  /** Users whose refresh fell back to their last known price — ADR-008. */
  fellBackCount: number;
  /** Users skipped entirely — external failed AND no price to fall back to. */
  failedUserIds: string[];
  /** `true` when the configured provider isn't `external` — nothing to do. */
  skipped: boolean;
}

const NOOP_RESULT: RefreshGoldPricesResult = {
  refreshedCount: 0,
  fellBackCount: 0,
  failedUserIds: [],
  skipped: true,
};

/**
 * Cron entry point (`/api/cron/gold-price`) — refreshes every user who
 * currently holds gold, but ONLY when `GOLD_PRICE_PROVIDER=external`
 * (todo.md: "Hanya berjalan bila GOLD_PRICE_PROVIDER=external"); the manual
 * provider has nothing for a cron to fetch on anyone's behalf. Idempotent
 * per (user, date) via `recordGoldPrice`'s upsert — running this twice in a
 * row for the same day just re-writes the same row.
 *
 * A fallback quote's `asOf` is the ORIGINAL price's own date (see
 * ManualPriceProvider — src/lib/gold-price/manual.ts), not "today", so a
 * failed refresh never fabricates freshness: the upsert becomes a no-op on
 * that earlier date, and the staleness badge keeps counting correctly from
 * the last time a price genuinely changed.
 */
export async function refreshGoldPrices(): Promise<RefreshGoldPricesResult> {
  const providerId: GoldPriceProviderId = getConfiguredProviderId();
  if (providerId !== 'external') {
    return NOOP_RESULT;
  }

  const holders = await dbRead
    .selectDistinct({ userId: assets.userId })
    .from(assets)
    .where(and(eq(assets.assetType, 'gold'), eq(assets.status, 'active')));

  let refreshedCount = 0;
  let fellBackCount = 0;
  const failedUserIds: string[] = [];

  for (const { userId } of holders) {
    try {
      const { quote, fellBackToManual } = await fetchGoldPriceWithFallback(userId);
      await recordGoldPrice(userId, {
        priceDate: quote.asOf.toISOString().slice(0, 10),
        sellPerGram: quote.sellPerGram,
        buybackPerGram: quote.buybackPerGram,
        source: fellBackToManual ? 'manual' : 'external',
      });
      if (fellBackToManual) {
        fellBackCount++;
      } else {
        refreshedCount++;
      }
    } catch (err) {
      console.error(`[gold-price] failed to refresh price for user ${userId}`, err);
      failedUserIds.push(userId);
    }
  }

  return { refreshedCount, fellBackCount, failedUserIds, skipped: false };
}
