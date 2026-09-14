/**
 * Optional external gold price provider — ADR-008, behind
 * `GOLD_PRICE_PROVIDER=external`.
 *
 * Scope note (spec.md): "Tidak termasuk: integrasi API eksternal aktif
 * (kerangka disiapkan, aktivasi opsional di task 23)". This class is the
 * framework — a real `fetch()` against a configurable HTTP endpoint, with
 * response validation — not a specific vendor integration; task 23 is
 * where `GOLD_PRICE_PROVIDER=external` actually gets flipped on in
 * production, per an env flag this task only wires up and tests the
 * fallback path for (spec.md "Batasan — Tanya dulu": "mengaktifkan
 * provider eksternal di produksi").
 *
 * Never the ONLY source (spec.md "Jangan": "menjadikan provider eksternal
 * sebagai satu-satunya sumber") — every caller reaches this class through
 * `fetchGoldPriceWithFallback` (./provider.ts), which always has
 * `ManualPriceProvider` as a backstop.
 */
import type { GoldPriceProvider, GoldPriceQuote } from './provider';

export interface ExternalPriceProviderConfig {
  apiUrl: string;
  apiKey?: string;
}

interface ExternalPriceResponseShape {
  sellPerGram: string | number;
  buybackPerGram: string | number;
  asOf?: string;
}

function isExternalPriceResponseShape(value: unknown): value is ExternalPriceResponseShape {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const isMoneyLike = (v: unknown) => typeof v === 'string' || typeof v === 'number';
  return isMoneyLike(record.sellPerGram) && isMoneyLike(record.buybackPerGram);
}

export class ExternalPriceProvider implements GoldPriceProvider {
  readonly id = 'external';

  constructor(private readonly config: ExternalPriceProviderConfig) {}

  /** Throws on any non-2xx response, network failure, or malformed body —
   * every failure mode is deliberately treated the same by the caller
   * (`fetchGoldPriceWithFallback`): fall back to the manual price. Never
   * swallows an error itself; ADR-008's fallback lives one layer up so it
   * can be tested independently of this class's HTTP details. */
  async fetch(): Promise<GoldPriceQuote> {
    const response = await fetch(this.config.apiUrl, {
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined,
      // Never cached — a stale gold price is exactly the failure mode this
      // whole feature exists to surface honestly, not paper over.
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`ExternalPriceProvider: request failed with HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!isExternalPriceResponseShape(body)) {
      throw new Error('ExternalPriceProvider: response body is missing sellPerGram/buybackPerGram');
    }

    return {
      sellPerGram: BigInt(body.sellPerGram),
      buybackPerGram: BigInt(body.buybackPerGram),
      asOf: body.asOf ? new Date(body.asOf) : new Date(),
    };
  }
}
