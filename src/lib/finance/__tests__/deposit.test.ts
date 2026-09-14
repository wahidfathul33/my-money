/**
 * Unit tests for deposit interest math — docs/03-domain-model.md §11.3,
 * ADR-013 (docs/16-decision-log.md), tasks/17-assets-deposits/spec.md.
 *
 * Every expected numeric literal below is HAND-COMPUTED, with the arithmetic
 * spelled out in a comment right above the assertion — never copied from
 * this module's own output. spec.md is explicit about why: "Test yang
 * harapannya berasal dari kode yang diuji hanya mengunci bug, tidak
 * menangkapnya" (a test whose expectation comes from the code under test
 * only locks a bug in, it doesn't catch one).
 *
 * NOTE on docs/14-testing-strategy.md §4's own example: its literal bigint
 * values (`10_479_45n`, `2_095_89n`, `8_383_56n`, `10_008_383_56n`) do not
 * round-trip to the number the comment right above them states (e.g.
 * `10_479_45n` reads as 1,047,945 — one digit short of the 10,479,452 the
 * comment itself computes). Rather than propagate what looks like a
 * transcription typo in the doc into this suite, every value here was
 * independently re-derived by hand (see comments) and cross-checked two
 * ways (a direct rupiah-then-scale computation, and the exact reduced
 * fraction) before being written down. The 90-day scenario below uses the
 * SAME principal/rate/dates as that doc example specifically so the
 * doc can be corrected against this suite.
 */
import { describe, expect, it } from 'vitest';
import {
  accruedInterest,
  calculateDepositInterest,
  currentValue,
  daysRemaining,
  shouldApplyTax,
  type DepositSnapshot,
} from '../deposit';

describe('calculateDepositInterest', () => {
  it('menghitung bunga setahun penuh, tanpa sisa pembulatan — kasus sanity-check spec.md', () => {
    // Rp100.000.000 @ 4,25%/tahun, 2026-01-01 → 2027-01-01 = 365 hari (2026
    // bukan tahun kabisat: 2026/4 = 506,5), jadi tenor/365 = 1 persis.
    //   bunga_kotor = 100.000.000 × 0,0425 × (365/365) = 4.250.000
    //   pajak       = 4.250.000 × 0,20                 =   850.000
    //   bunga_bersih= 4.250.000 − 850.000               = 3.400.000
    //   nilai_jatuh_tempo = 100.000.000 + 3.400.000     = 103.400.000
    // Ini PERSIS angka "manual sanity check" todo.md: Rp100jt @ 4,25% setahun
    // → estimasi bunga bersih ≈ Rp3,4jt (bukan Rp4,25jt yang mengabaikan pajak).
    const result = calculateDepositInterest({
      principal: 100_000_000_00n,
      annualRatePercent: 4.25,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2027-01-01T00:00:00.000Z'),
      taxRate: 0.2,
    });

    expect(result.grossInterest).toBe(4_250_000_00n);
    expect(result.tax).toBe(850_000_00n);
    expect(result.netInterest).toBe(3_400_000_00n);
    expect(result.maturityValue).toBe(103_400_000_00n);
  });

  it('memprorata bunga 90 hari dengan pembulatan half-up (skenario docs/14 §4, dihitung ulang tangan)', () => {
    // Rp10.000.000 @ 4,25%/tahun, 2026-01-01 → 2026-04-01 = 90 hari
    // (Jan 31 + Feb 28 + Mar 31 = 90; 2026 bukan kabisat).
    //   bunga_kotor (sen, eksak) = 1.000.000.000 × 0,0425 × 90/365
    //                            = 42.500.000 × 90 / 365
    //                            = 3.825.000.000 / 365
    //                            = 765.000.000 / 73        (bagi 5)
    //                            = 10.479.452 sisa 4/73 (≈10.479.452,0548)
    //     → dibulatkan half-up  = 10.479.452 sen
    //   pajak   = 10.479.452 × 0,20 = 2.095.890,4 → half-up = 2.095.890 sen
    //   bersih  = 10.479.452 − 2.095.890            = 8.383.562 sen
    //   nilai jatuh tempo = 1.000.000.000 + 8.383.562 = 1.008.383.562 sen
    const result = calculateDepositInterest({
      principal: 10_000_000_00n,
      annualRatePercent: 4.25,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2026-04-01T00:00:00.000Z'),
      taxRate: 0.2,
    });

    expect(result.grossInterest).toBe(10_479_452n);
    expect(result.tax).toBe(2_095_890n);
    expect(result.netInterest).toBe(8_383_562n);
    expect(result.maturityValue).toBe(1_008_383_562n);
  });

  it('pembulatan half-up membulatkan ke ATAS saat sisa ≥ 0,5 sen, bukan dipotong (truncate)', () => {
    // Rp10.000 @ 5%/tahun, tenor 1 hari.
    //   bunga_kotor eksak = 1.000.000 × 0,05 × 1/365 = 50.000/365
    //                     = 136,9863... sen
    // Sisa 0,9863 ≥ 0,5 → half-up membulatkan ke 137, BUKAN 136. Implementasi
    // yang memotong (Math.floor / bigint division polos tanpa +setengah)
    // akan salah menghasilkan 136 di sini — itulah yang test ini tangkap.
    const result = calculateDepositInterest({
      principal: 1_000_000n,
      annualRatePercent: 5,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2026-01-02T00:00:00.000Z'),
      taxRate: 0,
    });

    expect(result.grossInterest).toBe(137n);
    expect(result.netInterest).toBe(137n); // taxRate 0 di sini → bersih = kotor
    expect(result.maturityValue).toBe(1_000_137n);
  });

  it('tenor 0 hari (start = maturity) → bunga 0, nilai jatuh tempo = pokok', () => {
    // bunga_kotor = pokok × tarif × (0/365) = 0, berapa pun pokok/tarifnya.
    const result = calculateDepositInterest({
      principal: 10_000_000_00n,
      annualRatePercent: 4.25,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2026-01-01T00:00:00.000Z'),
      taxRate: 0.2,
    });

    expect(result.grossInterest).toBe(0n);
    expect(result.tax).toBe(0n);
    expect(result.netInterest).toBe(0n);
    expect(result.maturityValue).toBe(10_000_000_00n);
  });

  it('taxRate 0 (pokok di bawah ambang PPh) → pajak 0, bersih = kotor', () => {
    // Rp5.000.000 @ 4%/tahun, setahun penuh (365/365).
    //   bunga_kotor = 5.000.000 × 0,04 × 1 = 200.000 → 20.000.000 sen, eksak.
    // Pemanggil (service layer) yang memutuskan taxRate 0 lewat
    // shouldApplyTax(principal) sebelum memanggil fungsi ini — fungsi ini
    // sendiri hanya memakai taxRate apa adanya.
    const result = calculateDepositInterest({
      principal: 5_000_000_00n,
      annualRatePercent: 4.0,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2027-01-01T00:00:00.000Z'),
      taxRate: 0,
    });

    expect(result.grossInterest).toBe(20_000_000n);
    expect(result.tax).toBe(0n);
    expect(result.netInterest).toBe(result.grossInterest);
  });

  it('tenor negatif (data tidak wajar) diperlakukan sebagai 0, bukan bunga negatif', () => {
    const result = calculateDepositInterest({
      principal: 10_000_000_00n,
      annualRatePercent: 4.25,
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      maturityDate: new Date('2026-01-01T00:00:00.000Z'), // sebelum start — tidak valid
      taxRate: 0.2,
    });
    expect(result.grossInterest).toBe(0n);
  });
});

describe('shouldApplyTax — ambang Rp7.500.000 (PPh final 20%, docs/03 §11.3)', () => {
  it('pokok TEPAT Rp7.500.000 → tidak kena pajak (ambang inklusif di sisi bebas pajak)', () => {
    expect(shouldApplyTax(7_500_000_00n)).toBe(false);
  });

  it('pokok Rp7.500.000,01 (1 sen di atas ambang) → kena pajak', () => {
    expect(shouldApplyTax(7_500_000_00n + 1n)).toBe(true);
  });

  it('pokok jauh di bawah ambang (Rp1.000.000) → tidak kena pajak', () => {
    expect(shouldApplyTax(1_000_000_00n)).toBe(false);
  });

  it('pokok jauh di atas ambang (Rp100.000.000) → kena pajak', () => {
    expect(shouldApplyTax(100_000_000_00n)).toBe(true);
  });
});

// Deposit tetap (200 hari) dengan bunga harian BULAT (Rp1.000/hari) — dipilih
// supaya SETIAP potongan tenor (100 hari, 10 hari, 200 hari) menghasilkan
// bunga eksak tanpa sisa pembulatan, sehingga angka harapan mudah diverifikasi
// tangan: pokok × 1% / 365 hari = 3.650.000.000 × 0,01 / 365 = 100.000 sen/hari
// PERSIS (3.650.000.000 dipilih karena habis dibagi 365).
const FLAT_DEPOSIT: DepositSnapshot = {
  principal: 3_650_000_000n, // Rp36.500.000
  interestRateAnnual: 1.0,
  taxRate: 0.2,
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  maturityDate: new Date('2026-07-20T00:00:00.000Z'), // +200 hari, lihat komentar di bawah
  payoutSchedule: 'at_maturity',
  lastInterestPaymentDate: null,
};
// Jan1 → Jul20 = 200 hari: Jan(31)+Feb(28)+Mar(31)+Apr(30)+May(31)+Jun(30)=181,
// +19 hari di Juli = 200.

describe('accruedInterest — estimasi berjalan, diprorata dari tanggal mulai (atau pembayaran terakhir) sampai `asOf`', () => {
  it('memprorata 100 dari 200 hari tenor → separuh bunga bersih', () => {
    // 100 hari × 100.000 sen/hari = 10.000.000 sen kotor (eksak).
    // pajak 20%  = 2.000.000 sen
    // bersih     = 8.000.000 sen
    const asOf = new Date('2026-04-11T00:00:00.000Z'); // Jan1+100 hari (Jan31+Feb28+Mar31=90, +10=100)
    expect(accruedInterest(FLAT_DEPOSIT, asOf)).toBe(8_000_000n);
  });

  it('dibatasi (capped) pada tenor penuh — tidak terus bertambah melewati jatuh tempo', () => {
    // Bunga kotor tenor PENUH (200 hari) = 200 × 100.000 = 20.000.000 sen.
    // pajak 20% = 4.000.000 → bersih = 16.000.000 sen. `asOf` jauh melewati
    // maturityDate harus tetap memberi angka yang SAMA, bukan lebih besar.
    const wellPastMaturity = new Date('2027-01-01T00:00:00.000Z');
    expect(accruedInterest(FLAT_DEPOSIT, wellPastMaturity)).toBe(16_000_000n);
    expect(accruedInterest(FLAT_DEPOSIT, FLAT_DEPOSIT.maturityDate)).toBe(16_000_000n);
  });

  it('memakai lastInterestPaymentDate sebagai titik awal saat sudah pernah dibayar (skenario `monthly`)', () => {
    // Terakhir dibayar di hari ke-90 (2026-04-01); `asOf` 10 hari sesudahnya
    // (2026-04-11) → hanya memprorata 10 hari BARU, bukan dari startDate:
    //   kotor = 10 × 100.000 = 1.000.000 sen, pajak 20% = 200.000,
    //   bersih = 800.000 sen.
    const deposit: DepositSnapshot = {
      ...FLAT_DEPOSIT,
      payoutSchedule: 'monthly',
      lastInterestPaymentDate: new Date('2026-04-01T00:00:00.000Z'),
    };
    const asOf = new Date('2026-04-11T00:00:00.000Z');
    expect(accruedInterest(deposit, asOf)).toBe(800_000n);
  });

  it('`asOf` sebelum startDate (data tidak wajar) → 0, bukan angka negatif', () => {
    const beforeStart = new Date('2025-12-01T00:00:00.000Z');
    expect(accruedInterest(FLAT_DEPOSIT, beforeStart)).toBe(0n);
  });
});

describe('currentValue — ADR-013: bunga akrual TIDAK PERNAH masuk nilai berjalan', () => {
  it('`at_maturity`: nilai berjalan = pokok, walau bunga akrual sudah besar', () => {
    // Sehari sebelum jatuh tempo (hari ke-199 dari 200) — bunga akrual sudah
    // hampir penuh, TAPI currentValue tidak boleh memasukkannya.
    const almostMaturity = new Date('2026-07-19T00:00:00.000Z');
    const accrued = accruedInterest(FLAT_DEPOSIT, almostMaturity);
    expect(accrued).toBeGreaterThan(0n); // memastikan test ini benar-benar menguji sesuatu yang besar

    expect(currentValue(FLAT_DEPOSIT)).toBe(FLAT_DEPOSIT.principal);
    expect(currentValue(FLAT_DEPOSIT)).not.toBe(FLAT_DEPOSIT.principal + accrued);
  });

  it('`monthly`: nilai berjalan tetap pokok — bunga yang sudah dibayar sudah jadi saldo dompet, bukan bagian deposito', () => {
    const monthlyDeposit: DepositSnapshot = { ...FLAT_DEPOSIT, payoutSchedule: 'monthly' };
    expect(currentValue(monthlyDeposit)).toBe(monthlyDeposit.principal);
  });

  it('deposito dengan bunga akrual BESAR (mendekati bunga setahun penuh Rp100 juta @ 4,25%) → total aset tetap pokok saja', () => {
    // Skenario todo.md persis: satu deposito Rp100.000.000 @ 4,25% hampir
    // jatuh tempo (bunga akrual bersih mendekati Rp3.400.000 — lihat test
    // pertama file ini). Menjumlah currentValue() atas daftar deposito tidak
    // boleh memasukkan angka itu sama sekali.
    const nearMaturityDeposit: DepositSnapshot = {
      principal: 100_000_000_00n,
      interestRateAnnual: 4.25,
      taxRate: 0.2,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2027-01-01T00:00:00.000Z'),
      payoutSchedule: 'at_maturity',
      lastInterestPaymentDate: null,
    };
    const oneDayBeforeMaturity = new Date('2026-12-31T00:00:00.000Z');
    const accrued = accruedInterest(nearMaturityDeposit, oneDayBeforeMaturity);
    expect(accrued).toBeGreaterThan(3_000_000_00n); // bunga akrual memang besar, bukan kasus trivial

    const deposits = [nearMaturityDeposit, FLAT_DEPOSIT];
    const totalAsset = deposits.reduce((sum, d) => sum + currentValue(d), 0n);
    expect(totalAsset).toBe(nearMaturityDeposit.principal + FLAT_DEPOSIT.principal);
  });
});

describe('daysRemaining — sisa hari sampai jatuh tempo (dapat negatif bila telat)', () => {
  it('100 hari sebelum jatuh tempo → 100', () => {
    const today = new Date('2026-04-11T00:00:00.000Z'); // 100 hari sebelum 2026-07-20
    expect(daysRemaining(FLAT_DEPOSIT, today)).toBe(100);
  });

  it('tepat pada tanggal jatuh tempo → 0', () => {
    expect(daysRemaining(FLAT_DEPOSIT, FLAT_DEPOSIT.maturityDate)).toBe(0);
  });

  it('5 hari setelah jatuh tempo (telat) → -5, bukan 0', () => {
    const today = new Date('2026-07-25T00:00:00.000Z'); // 5 hari setelah 2026-07-20
    expect(daysRemaining(FLAT_DEPOSIT, today)).toBe(-5);
  });
});
