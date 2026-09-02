/**
 * Wallet type presentation, plus a small curated icon/color catalog for the
 * create/edit form (tasks/05-wallets/todo.md: `updateWallet` — "nama, ikon,
 * warna").
 *
 * Deliberately NOT the shared, ~60-icon category catalog (docs/07-design-system.md
 * §13) — that's `src/lib/icons.ts`, task 06's to create (see this task's
 * briefing, "Known merge-conflict risk"). This is a small, inline list
 * scoped to wallets only, per that briefing's explicit guidance.
 */
import {
  Banknote,
  Building2,
  Coins,
  CreditCard,
  Landmark,
  PiggyBank,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { wallets } from '@/lib/db/schema/wallets';

export type WalletType = (typeof wallets.$inferSelect)['type'];

export interface WalletTypeMeta {
  label: string;
  /** Default stored in `wallets.icon`/`wallets.color` at creation — the
   * user can change both afterward (see `updateWallet`). */
  icon: string;
  color: string;
  Icon: LucideIcon;
}

export const WALLET_TYPE_ORDER: WalletType[] = ['cash', 'bank', 'ewallet', 'credit_card'];

export const WALLET_TYPE_META: Record<WalletType, WalletTypeMeta> = {
  cash: { label: 'Tunai', icon: 'wallet', color: 'emerald', Icon: Wallet },
  bank: { label: 'Bank', icon: 'landmark', color: 'blue', Icon: Landmark },
  ewallet: { label: 'E-Wallet', icon: 'smartphone', color: 'violet', Icon: Smartphone },
  credit_card: { label: 'Liabilitas', icon: 'credit-card', color: 'rose', Icon: CreditCard },
};

/** Group label per type — see `WALLET_TYPE_META.label`; kept as its own map
 * for readability at call sites (spec: "kartu kredit ... berlabel 'Liabilitas'"). */
export const WALLET_GROUP_LABEL: Record<WalletType, string> = {
  cash: 'Tunai',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  credit_card: 'Liabilitas',
};

interface WalletIconOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

/** Curated icon picker options (8) — enough visual variety for personal
 * wallets without building a full catalog. */
export const WALLET_ICON_OPTIONS: WalletIconOption[] = [
  { value: 'wallet', label: 'Dompet', Icon: Wallet },
  { value: 'landmark', label: 'Bank', Icon: Landmark },
  { value: 'smartphone', label: 'E-Wallet', Icon: Smartphone },
  { value: 'credit-card', label: 'Kartu', Icon: CreditCard },
  { value: 'piggy-bank', label: 'Celengan', Icon: PiggyBank },
  { value: 'banknote', label: 'Uang', Icon: Banknote },
  { value: 'coins', label: 'Koin', Icon: Coins },
  { value: 'building-2', label: 'Gedung', Icon: Building2 },
];

export const WALLET_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  WALLET_ICON_OPTIONS.map((o) => [o.value, o.Icon]),
);

interface WalletColorOption {
  value: string;
  label: string;
  /** Solid swatch shown in the picker chip. */
  swatchClass: string;
}

export const WALLET_COLOR_OPTIONS: WalletColorOption[] = [
  { value: 'emerald', label: 'Hijau', swatchClass: 'bg-emerald-500' },
  { value: 'blue', label: 'Biru', swatchClass: 'bg-blue-500' },
  { value: 'violet', label: 'Ungu', swatchClass: 'bg-violet-500' },
  { value: 'rose', label: 'Merah muda', swatchClass: 'bg-rose-500' },
  { value: 'amber', label: 'Kuning', swatchClass: 'bg-amber-500' },
  { value: 'teal', label: 'Toska', swatchClass: 'bg-teal-500' },
  { value: 'indigo', label: 'Nila', swatchClass: 'bg-indigo-500' },
  { value: 'slate', label: 'Abu-abu', swatchClass: 'bg-slate-500' },
];

/** Icon-circle background/foreground per color name — used by `WalletCard`. */
export const WALLET_COLOR_CLASS: Record<string, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  teal: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  indigo: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};
