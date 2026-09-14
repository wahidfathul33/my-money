/**
 * The default, always-registered `GoldPriceProvider` — ADR-008.
 *
 * "Manual" doesn't mean "prompts a human right now"; it means "whatever was
 * last recorded for this user" (via `recordGoldPrice`, either typed by hand
 * or written by a previous successful external fetch — `gold_prices` has no
 * separate table per source, just a `source` column). This is exactly the
 * value `fetchGoldPriceWithFallback` (./provider.ts) falls back to when the
 * external provider is configured but fails: the "last known price" IS this
 * provider's fetch result.
 *
 * Read-only (`dbRead`) — this module never writes; `recordGoldPrice`
 * (src/lib/services/gold.ts) owns every write to `gold_prices`.
 */
import { desc } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { goldPrices } from '@/lib/db/schema';
import { ownedBy } from '@/lib/db/scoped';
import type { GoldPriceProvider, GoldPriceQuote } from './provider';

export class ManualPriceProvider implements GoldPriceProvider {
  readonly id = 'manual';

  constructor(private readonly userId: string) {}

  /** Throws if `userId` has never recorded a price — there is nothing to
   * fall back to yet. Callers (queries.ts's holdings summary, the cron)
   * treat "no price at all" as its own state (spec.md: "Belum ada harga
   * sama sekali → valuasi disembunyikan"), not a crash. */
  async fetch(): Promise<GoldPriceQuote> {
    const [latest] = await dbRead
      .select({
        sellPricePerGram: goldPrices.sellPricePerGram,
        buybackPricePerGram: goldPrices.buybackPricePerGram,
        priceDate: goldPrices.priceDate,
      })
      .from(goldPrices)
      .where(ownedBy(goldPrices, this.userId))
      .orderBy(desc(goldPrices.priceDate))
      .limit(1);

    if (!latest) {
      throw new Error(`ManualPriceProvider: no gold price has ever been recorded for user ${this.userId}`);
    }

    return {
      sellPerGram: latest.sellPricePerGram,
      buybackPerGram: latest.buybackPricePerGram,
      // `priceDate` is a DATE column (no time-of-day) — midnight UTC on that
      // date is the right, unambiguous `asOf` for a day-scoped price.
      asOf: new Date(`${latest.priceDate}T00:00:00.000Z`),
    };
  }
}
