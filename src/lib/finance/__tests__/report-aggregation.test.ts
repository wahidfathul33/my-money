import { describe, expect, it } from 'vitest';
import {
  findDominantCategory,
  hasEnoughHistory,
  mergeTailIntoOther,
  sharePercent,
  shortMonthLabel,
  type SeriesItem,
} from '../report-aggregation';

function item(key: string, amount: bigint): SeriesItem {
  return { key, label: key, amount };
}

describe('mergeTailIntoOther — spec.md "Maksimal 6 seri; sisanya digabung"', () => {
  it('tidak mengubah apa pun kalau jumlah item <= maxSeries', () => {
    const items = [item('a', 300n), item('b', 200n), item('c', 100n)];
    expect(mergeTailIntoOther(items, 6)).toEqual(items);
  });

  it('persis 6 item tidak digabung (tidak ada yang perlu dilebur)', () => {
    const items = Array.from({ length: 6 }, (_, i) => item(`c${i}`, BigInt(6 - i)));
    const result = mergeTailIntoOther(items, 6);
    expect(result).toHaveLength(6);
    expect(result).toEqual(items);
  });

  it('7 item → 5 asli + 1 "Lainnya" menjumlahkan ekor', () => {
    const items = [
      item('a', 100n),
      item('b', 90n),
      item('c', 80n),
      item('d', 70n),
      item('e', 60n),
      item('f', 50n),
      item('g', 40n),
    ];
    const result = mergeTailIntoOther(items, 6);
    expect(result).toHaveLength(6);
    expect(result.slice(0, 5).map((r) => r.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const other = result[5]!;
    expect(other.label).toBe('Lainnya');
    expect(other.amount).toBe(50n + 40n); // f + g
  });

  it('tidak mengurutkan ulang — mempercayai urutan yang sudah diberikan caller', () => {
    // Sengaja TIDAK terurut menurun (item pertama justru terkecil) — kalau
    // fungsi ini diam-diam mengurutkan ulang, "low" akan pindah ke akhir
    // dan ikut dilebur; ia harus tetap di head karena hanya POSISI yang
    // menentukan, bukan besarnya amount.
    const items = [item('low', 1n), item('high', 100n), item('mid', 50n)];
    const result = mergeTailIntoOther(items, 2);
    expect(result[0]!.key).toBe('low');
    expect(result[1]!.label).toBe('Lainnya');
    expect(result[1]!.amount).toBe(100n + 50n); // high + mid, urutan asli dipertahankan sebagai ekor
  });

  it('menolak maxSeries < 1', () => {
    expect(() => mergeTailIntoOther([item('a', 1n)], 0)).toThrow(RangeError);
  });
});

describe('sharePercent', () => {
  it('menghitung persentase dasar', () => {
    expect(sharePercent(25n, 100n)).toBe(25);
  });

  it('membulatkan ke satu desimal', () => {
    expect(sharePercent(1n, 3n)).toBeCloseTo(33.3, 1);
  });

  it('total <= 0 menghasilkan 0, bukan Infinity/NaN', () => {
    expect(sharePercent(10n, 0n)).toBe(0);
    expect(sharePercent(10n, -5n)).toBe(0);
  });
});

describe('findDominantCategory — spec.md "Satu kategori > 80% → catatan Didominasi"', () => {
  it('mengembalikan null kalau tidak ada yang > 80%', () => {
    const items = [item('a', 50n), item('b', 50n)];
    expect(findDominantCategory(items, 100n)).toBeNull();
  });

  it('mendeteksi kategori yang > 80% persis', () => {
    const items = [item('a', 81n), item('b', 19n)];
    const result = findDominantCategory(items, 100n);
    expect(result?.item.key).toBe('a');
    expect(result?.percent).toBeCloseTo(81, 5);
  });

  it('tepat 80% TIDAK dianggap dominan (ambang eksklusif — spec.md ">80%")', () => {
    const items = [item('a', 80n), item('b', 20n)];
    expect(findDominantCategory(items, 100n)).toBeNull();
  });

  it('total <= 0 selalu null', () => {
    expect(findDominantCategory([item('a', 10n)], 0n)).toBeNull();
  });
});

describe('shortMonthLabel — spec.md "Sep bukan September"', () => {
  it('menghasilkan label bulan pendek dalam bahasa Indonesia', () => {
    expect(shortMonthLabel('2026-09')).toBe('Sep');
    expect(shortMonthLabel('2026-01')).toBe('Jan');
    expect(shortMonthLabel('2026-12')).toBe('Des');
  });

  it('label selalu pendek — tidak pernah melebihi beberapa karakter', () => {
    for (let m = 1; m <= 12; m++) {
      const period = `2026-${String(m).padStart(2, '0')}`;
      expect(shortMonthLabel(period).length).toBeLessThanOrEqual(4);
    }
  });

  it('period tanpa tanda hubung (malformed) jatuh ke bulan Januari — fallback `month ?? 1`', () => {
    // period.split('-') pada string tanpa '-' menghasilkan array satu elemen
    // — `month` benar-benar undefined di sini, bukan cuma di level tipe.
    expect(shortMonthLabel('2026')).toBe('Jan');
  });
});

describe('hasEnoughHistory — todo.md "Empty state: data < 7 hari"', () => {
  const NOW = new Date('2026-09-16T00:00:00.000Z');

  it('null (belum ada catatan) → tidak cukup', () => {
    expect(hasEnoughHistory(null, NOW)).toBe(false);
  });

  it('6 hari yang lalu → belum cukup', () => {
    const sixDaysAgo = new Date(NOW.getTime() - 6 * 86_400_000);
    expect(hasEnoughHistory(sixDaysAgo, NOW)).toBe(false);
  });

  it('tepat 7 hari yang lalu → cukup (ambang inklusif)', () => {
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(hasEnoughHistory(sevenDaysAgo, NOW)).toBe(true);
  });

  it('30 hari yang lalu → cukup', () => {
    const monthAgo = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(hasEnoughHistory(monthAgo, NOW)).toBe(true);
  });
});
