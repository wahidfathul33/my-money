// @vitest-environment node
/**
 * Integration tests for the gold market price reads — real Neon database
 * (see .env, loaded via vitest.config.ts). `gold_market_prices` is global,
 * not per-user, so cleanup here deletes by the test's own `externalId`s
 * rather than reusing `deleteTestUser`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { dbWrite } from '@/lib/db/write';
import { goldMarketPrices } from '@/lib/db/schema';
import { listGoldMarketPrices, listGoldVendors } from '../market-queries';

describe('gold market price queries', () => {
  const externalIds: bigint[] = [];

  afterEach(async () => {
    const ids = externalIds.splice(0);
    if (ids.length > 0) {
      await dbWrite.delete(goldMarketPrices).where(inArray(goldMarketPrices.externalId, ids));
    }
  });

  async function seed(rows: { externalId: bigint; vendorName: string; productName: string }[]) {
    for (const row of rows) {
      externalIds.push(row.externalId);
      await dbWrite.insert(goldMarketPrices).values({
        id: uuidv7(),
        externalId: row.externalId,
        vendorName: row.vendorName,
        productName: row.productName,
        priceDate: '2026-08-29',
        buyPrice: 140_000_000n,
        buybackPrice: 125_000_000n,
        currency: 'IDR',
        asOf: new Date('2026-08-29T08:15:00Z'),
      });
    }
  }

  it('listGoldMarketPrices returns every row when no search is given', async () => {
    const a = BigInt(Date.now());
    const b = a + 1n;
    await seed([
      { externalId: a, vendorName: 'Antam', productName: 'Emas Antam 1 Gram' },
      { externalId: b, vendorName: 'Pegadaian', productName: 'Emas Pegadaian 5 Gram' },
    ]);

    const productNames = (await listGoldMarketPrices()).map((i) => i.productName);
    expect(productNames).toEqual(expect.arrayContaining(['Emas Antam 1 Gram', 'Emas Pegadaian 5 Gram']));
  });

  it('listGoldMarketPrices filters by a case-insensitive vendor or product match', async () => {
    const a = BigInt(Date.now()) + 1000n;
    const b = a + 1n;
    await seed([
      { externalId: a, vendorName: 'Antam', productName: 'Emas Antam 1 Gram' },
      { externalId: b, vendorName: 'Pegadaian', productName: 'Emas Pegadaian 5 Gram' },
    ]);

    const byVendor = await listGoldMarketPrices('antam');
    expect(byVendor.map((i) => i.vendorName)).toEqual(['Antam']);

    const byProduct = await listGoldMarketPrices('5 Gram');
    expect(byProduct.map((i) => i.vendorName)).toEqual(['Pegadaian']);

    const noMatch = await listGoldMarketPrices('nonexistent-vendor-xyz');
    expect(noMatch).toEqual([]);
  });

  it('listGoldVendors returns distinct vendor names, ordered', async () => {
    const a = BigInt(Date.now()) + 2000n;
    const b = a + 1n;
    const c = a + 2n;
    await seed([
      { externalId: a, vendorName: 'Zamrud', productName: 'Produk A' },
      { externalId: b, vendorName: 'Antam', productName: 'Produk B' },
      { externalId: c, vendorName: 'Antam', productName: 'Produk C' },
    ]);

    const vendors = await listGoldVendors();
    const names = vendors.map((v) => v.value);
    expect(names.filter((n) => n === 'Antam')).toHaveLength(1);
    expect(names.indexOf('Antam')).toBeLessThan(names.indexOf('Zamrud'));
  });
});
