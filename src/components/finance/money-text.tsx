import { cn } from '@/lib/utils';
import { formatIDR, type Money } from '@/lib/finance/money';

/**
 * `auto` menurunkan nada dari tanda; `neutral` untuk transfer (tanpa tanda,
 * tanpa warna arah); `plain` untuk nominal yang tidak membawa makna
 * finansial (mis. saldo dompet netral).
 */
type Tone = 'auto' | 'positive' | 'negative' | 'neutral' | 'plain';

interface MoneyTextProps {
  /** Nominal dalam satuan minor (sen). */
  amount: Money;
  tone?: Tone;
  /** Awalan +/− eksplisit. Wajib saat warna membawa makna. */
  showSign?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'display' | 'hero';
  className?: string;
}

// text-positive-readable (globals.css), bukan text-positive mentah:
// --color-positive di atas bg/surface gagal AA di mode terang
// (3.68-4.01:1) — lihat src/app/__tests__/contrast.test.ts dan laporan
// task 01. --color-negative di atas bg/surface sudah lolos di kedua mode,
// jadi tidak perlu perlakuan yang sama.
const TONE_CLASS: Record<Exclude<Tone, 'auto'>, string> = {
  positive: 'text-positive-readable',
  negative: 'text-negative',
  neutral: 'text-text-muted',
  plain: 'text-text',
};

const SIZE_CLASS = {
  sm: 'text-sm',
  md: 'text-body',
  lg: 'text-title font-semibold',
  display: 'text-display font-semibold',
  hero: 'text-hero font-bold',
} as const;

export function MoneyText({
  amount,
  tone = 'auto',
  showSign = false,
  size = 'md',
  className,
}: MoneyTextProps) {
  const resolved =
    tone === 'auto' ? (amount > 0n ? 'positive' : amount < 0n ? 'negative' : 'plain') : tone;

  const sign = showSign && amount !== 0n ? (amount > 0n ? '+' : '−') : '';
  const magnitude = amount < 0n ? -amount : amount;

  return (
    <span
      className={cn('font-money', TONE_CLASS[resolved], SIZE_CLASS[size], className)}
      // Pembaca layar mendapat kalimat, bukan simbol matematika: "masuk
      // Rp45.000" / "keluar Rp45.000", bukan "plus/minus Rp45.000".
      aria-label={`${sign === '+' ? 'masuk' : sign === '−' ? 'keluar' : ''} ${formatIDR(magnitude)}`.trim()}
    >
      {sign}
      {formatIDR(magnitude)}
    </span>
  );
}
