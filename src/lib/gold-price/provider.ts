/**
 * Pluggable gold price provider — docs/03-domain-model.md §11.2, ADR-008.
 *
 * `ManualPriceProvider` is always registered and is the default: it never
 * depends on network access, so a user can always price their holdings by
 * hand even when `GOLD_PRICE_PROVIDER` is unset. `ExternalPriceProvider`
 * only activates behind `GOLD_PRICE_PROVIDER=external` (spec.md scope note:
 * "kerangka disiapkan, aktivasi opsional di task 23" — this task builds the
 * framework and a working-but-off-by-default implementation, not a
 * production activation) and MUST fall back to the last known price when it
 * fails — `fetchGoldPriceWithFallback` below is that mandatory fallback,
 * unit-tested against a mocked failing fetch.
 *
 * Prices are per-user (`gold_prices.user_id` — docs/03 §11.2 "Harga
 * bersifat per user"): the row a user's holdings are valued against is
 * always THEIR OWN latest entry, whether it came from typing a number in or
 * from a successful external fetch. `ManualPriceProvider` is what "the last
 * known price" resolves to either way — there's no separate history table
 * per source, only `gold_prices.source` recording where each row came from.
 */
import type { Money } from '@/lib/finance/money';
import { getEnv } from '@/lib/env';
import { ManualPriceProvider } from './manual';
import { ExternalPriceProvider } from './external';

export interface GoldPriceQuote {
  sellPerGram: Money;
  buybackPerGram: Money;
  asOf: Date;
}

export interface GoldPriceProvider {
  readonly id: string;
  fetch(): Promise<GoldPriceQuote>;
}

export type GoldPriceProviderId = 'manual' | 'external';

/** Reads `GOLD_PRICE_PROVIDER` — anything other than the literal `'external'`
 * (unset, or any other value) resolves to `'manual'`, the safe default. */
export function getConfiguredProviderId(): GoldPriceProviderId {
  return getEnv().GOLD_PRICE_PROVIDER === 'external' ? 'external' : 'manual';
}

export interface GoldPriceFetchResult {
  quote: GoldPriceQuote;
  /** Which provider actually produced `quote` — may differ from the
   * CONFIGURED provider when a fallback occurred. */
  usedProviderId: GoldPriceProviderId;
  /** `true` when the external provider was configured but failed, and this
   * result is the fallback manual/last-known price instead. */
  fellBackToManual: boolean;
}

/**
 * Fetches a quote using the configured provider for `userId`, falling back
 * to `ManualPriceProvider` (the user's own last-recorded price) when the
 * external provider is configured but its fetch fails — ADR-008's mandatory
 * fallback, spec.md: "`ExternalPriceProvider` mundur ke harga manual
 * terakhir saat gagal — diverifikasi test".
 *
 * Throws only when there is truly NO price to fall back to (a user who has
 * never recorded one) — callers (recordGoldPrice's cron caller) treat that
 * as "nothing to refresh for this user yet", not an error worth crashing
 * the whole cron run over.
 */
export async function fetchGoldPriceWithFallback(userId: string): Promise<GoldPriceFetchResult> {
  const providerId = getConfiguredProviderId();

  if (providerId === 'manual') {
    const quote = await new ManualPriceProvider(userId).fetch();
    return { quote, usedProviderId: 'manual', fellBackToManual: false };
  }

  const env = getEnv();
  try {
    if (!env.GOLD_PRICE_API_URL) {
      throw new Error('GOLD_PRICE_PROVIDER=external but GOLD_PRICE_API_URL is not set');
    }
    const quote = await new ExternalPriceProvider({
      apiUrl: env.GOLD_PRICE_API_URL,
      apiKey: env.GOLD_PRICE_API_KEY,
    }).fetch();
    return { quote, usedProviderId: 'external', fellBackToManual: false };
  } catch (err) {
    // Cron-visible diagnostic — todo.md "Fallback ke harga manual saat
    // gagal, dicatat di log". Same ad-hoc `console.error('[tag]', err)`
    // shape as src/app/api/transactions/route.ts's route-level catches.
    console.error('[gold-price] external provider failed, falling back to the last known price', err);
    const quote = await new ManualPriceProvider(userId).fetch();
    return { quote, usedProviderId: 'manual', fellBackToManual: true };
  }
}
