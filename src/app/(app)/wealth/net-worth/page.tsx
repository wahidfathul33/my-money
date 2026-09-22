import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { NetWorthHero } from '@/components/finance/net-worth-hero';
import { MoneyText } from '@/components/finance/money-text';
import { NetWorthTrendSection } from '@/features/net-worth/components/trend-section';
import { CompositionBar, assetColorFor, liabilityColorFor } from '@/features/net-worth/components/composition-bar';
import { requireUser } from '@/lib/auth/require-user';
import { serializeMoney } from '@/lib/finance/money';
import { toLocalDate } from '@/lib/date/timezone';
import {
  buildAssetComposition,
  buildLiabilityComposition,
  getNetWorth,
  getNetWorthHistory,
} from '@/features/net-worth/queries';
import { getUserPreferences } from '@/features/settings/queries';

// The hero's own compact delta/sparkline looks at the trailing ~31 days
// only (docs/09-screen-specs.md §8/§1's "bulan ini" framing) — separate
// from the big area chart below, which shows whatever range the chip row
// selects (default 3 months). Both are seeded from the SAME initial
// `getNetWorthHistory('3m', ...)` call so the page does one query, not two.
const HERO_WINDOW_DAYS = 31;

/**
 * `/wealth/net-worth` — docs/09-screen-specs.md §8: hero, range chips + area
 * chart, asset composition (stacked bar), liabilities, receivables shown
 * separately with their counted/not-counted label. Every composition row is
 * a `Link` to its source module (spec.md's "penelusuran").
 */
export default async function NetWorthPage() {
  const user = await requireUser();
  const now = new Date();
  // tasks/22-settings-sharing-pwa: the caller's own timezone preference
  // (`/settings/preferences`), not a hardcoded MVP-wide assumption — fetched
  // first since getNetWorthHistory's cutoff math needs it.
  const preferences = await getUserPreferences(user.id);
  const tz = preferences.timezone;

  const [result, history] = await Promise.all([
    getNetWorth(user.id),
    getNetWorthHistory(user.id, '3m', now, tz),
  ]);

  const heroCutoff = new Date(now.getTime() - HERO_WINDOW_DAYS * 86_400_000);
  const heroCutoffStr = toLocalDate(heroCutoff, tz);
  const heroHistory = history.filter((h) => h.date >= heroCutoffStr).map((h) => ({ date: h.date, netWorth: h.netWorth }));

  const assetItems = buildAssetComposition(result.breakdown.assets);
  const liabilityItems = buildLiabilityComposition(result.breakdown.liabilities);

  return (
    <>
      <PageHeader title="Kekayaan Bersih" />
      <div className="px-page-x flex flex-col gap-8 pb-8">
        <NetWorthHero netWorth={result.netWorth} history={heroHistory} />

        <NetWorthTrendSection
          initialRange="3m"
          initialPoints={history.map((h) => ({ date: h.date, netWorth: serializeMoney(h.netWorth) }))}
        />

        <section className="flex flex-col gap-3">
          <h2 className="text-text text-sm font-semibold">Komposisi Aset</h2>
          <CompositionBar items={assetItems} colorFor={assetColorFor} emptyLabel="Belum ada aset tercatat." />
        </section>

        {liabilityItems.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-text text-sm font-semibold">Liabilitas</h2>
            <CompositionBar items={liabilityItems} colorFor={liabilityColorFor} emptyLabel="Tidak ada liabilitas." />
          </section>
        )}

        {/* Piutang — selalu terpisah dari komposisi aset (ADR-010), dengan
            label yang menyebut apakah ia sedang dihitung. */}
        {result.totalReceivables > 0n && (
          <Link
            href="/wealth/debts"
            className="pressable-tint bg-surface border-border rounded-card flex items-center justify-between gap-3 border p-4"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-text text-sm font-medium">Piutang</span>
              <span className="text-text-muted text-xs">
                {preferences.countReceivablesAsAsset ? 'Termasuk dalam kekayaan bersih' : 'Tidak dihitung dalam kekayaan bersih'}
              </span>
            </div>
            <MoneyText amount={result.totalReceivables} tone="plain" size="md" />
          </Link>
        )}
      </div>
    </>
  );
}
