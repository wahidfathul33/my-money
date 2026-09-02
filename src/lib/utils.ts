import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge tidak tahu skala token kustom kita. Tanpa ini, kelas warna
 * (`text-text-muted`) dan kelas ukuran font (`text-body`) — dua hal yang
 * sama-sama diawali `text-` tapi tidak dikenali — jatuh ke grup fallback
 * yang sama dan saling menimpa (lihat MoneyText: tone dan size keduanya
 * berupa kelas `text-*`).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['hero', 'display', 'title', 'heading', 'body'] }],
      rounded: [{ rounded: ['sheet', 'card', 'inner', 'input', 'chip'] }],
    },
  },
});

/**
 * Menggabungkan class Tailwind sambil menyelesaikan konflik (mis. `p-2` vs
 * `p-4`) — dipakai di seluruh komponen alih-alih penggabungan string manual.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
