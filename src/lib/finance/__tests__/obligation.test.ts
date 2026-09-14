import { describe, expect, it } from 'vitest';
import { deriveStatus, isOverdue, progressPercent } from '../obligation';
import type { Money } from '../money';

const INITIAL: Money = 10_000_000_00n; // Rp10.000.000

describe('deriveStatus (docs/03 §12: active -> partially_paid -> paid)', () => {
  it('sisa = awal -> active (belum ada pembayaran)', () => {
    expect(deriveStatus(INITIAL, INITIAL)).toBe('active');
  });

  it('sisa sebagian (di antara 0 dan awal) -> partially_paid', () => {
    expect(deriveStatus(INITIAL, 6_000_000_00n)).toBe('partially_paid');
  });

  it('sisa = 0 -> paid', () => {
    expect(deriveStatus(INITIAL, 0n)).toBe('paid');
  });

  it('sisa sangat kecil tapi bukan nol -> partially_paid, bukan paid', () => {
    expect(deriveStatus(INITIAL, 1n)).toBe('partially_paid');
  });

  it('never returns written_off — that status is only ever set explicitly by writeOff*', () => {
    // Exhaustive-ish sweep across the valid range; none of these should ever
    // surface a status outside the three amount-derived ones.
    for (const remaining of [INITIAL, INITIAL / 2n, INITIAL / 4n, 1n, 0n]) {
      expect(['active', 'partially_paid', 'paid']).toContain(deriveStatus(INITIAL, remaining));
    }
  });
});

describe('progressPercent', () => {
  it('sisa = awal -> 0% (belum ada yang dibayar)', () => {
    expect(progressPercent(INITIAL, INITIAL)).toBe(0);
  });

  it('separuh terbayar -> 50%', () => {
    expect(progressPercent(INITIAL, 5_000_000_00n)).toBe(50);
  });

  it('sisa = 0 -> 100% (lunas)', () => {
    expect(progressPercent(INITIAL, 0n)).toBe(100);
  });

  it('initialAmount = 0 (data tidak valid) tidak melempar dan tidak menghasilkan NaN', () => {
    expect(() => progressPercent(0n, 0n)).not.toThrow();
    expect(progressPercent(0n, 0n)).toBe(0);
  });

  it('tidak pernah keluar dari rentang 0-100', () => {
    expect(progressPercent(INITIAL, INITIAL * 2n)).toBeGreaterThanOrEqual(0); // defensively-shaped input
    expect(progressPercent(INITIAL, -1n)).toBeLessThanOrEqual(100);
  });
});

describe('isOverdue (docs/03 §12: due_date < hari_ini AND status <> paid, turunan bukan kolom)', () => {
  const NOW = new Date('2026-09-14T04:00:00.000Z'); // 11:00 WIB, 2026-09-14

  it('tanpa due_date -> tidak pernah overdue', () => {
    expect(isOverdue(null, 'active', NOW)).toBe(false);
  });

  it('due_date di masa lalu, status active -> overdue', () => {
    expect(isOverdue('2026-09-10', 'active', NOW)).toBe(true);
  });

  it('due_date di masa lalu, status partially_paid -> overdue', () => {
    expect(isOverdue('2026-09-10', 'partially_paid', NOW)).toBe(true);
  });

  it('due_date hari ini -> belum overdue (strict less-than, bukan <=)', () => {
    expect(isOverdue('2026-09-14', 'active', NOW)).toBe(false);
  });

  it('due_date di masa depan -> tidak overdue', () => {
    expect(isOverdue('2026-09-20', 'active', NOW)).toBe(false);
  });

  it('status paid -> tidak pernah overdue meski due_date lewat', () => {
    expect(isOverdue('2026-01-01', 'paid', NOW)).toBe(false);
  });

  it('status written_off -> tidak overdue meski due_date lewat (lihat doc comment: status terminal, bukan telat)', () => {
    expect(isOverdue('2026-01-01', 'written_off', NOW)).toBe(false);
  });

  it('batas hari zona waktu: WIB sudah tanggal 5, UTC masih tanggal 4 -> overdue memakai kalender WIB', () => {
    // 2026-09-04T18:00:00Z = 2026-09-05T01:00:00+07:00 — already the 5th in
    // Jakarta even though the raw UTC instant still reads the 4th. A due
    // date of the 4th must already be overdue in WIB terms; a naive
    // `now.toISOString().slice(0,10)` comparison would wrongly say "not yet".
    const boundary = new Date('2026-09-04T18:00:00.000Z');
    expect(isOverdue('2026-09-04', 'active', boundary, 'Asia/Jakarta')).toBe(true);
    // Sanity check on the flip side: the SAME instant, read as a bare UTC
    // date, would NOT consider the 4th to be in the past yet — demonstrating
    // this is genuinely a timezone-sensitive boundary and not a tautology.
    expect(boundary.toISOString().slice(0, 10)).toBe('2026-09-04');
  });

  it('default now/tz tidak melempar saat dipanggil tanpa argumen opsional', () => {
    expect(() => isOverdue('2020-01-01', 'active')).not.toThrow();
    expect(isOverdue('2020-01-01', 'active')).toBe(true); // jauh di masa lalu, tanggal berapa pun sekarang
  });
});
