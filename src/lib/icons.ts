/**
 * Curated icon set — tasks/06-categories/spec.md "pemilih ikon terkurasi",
 * tasks/06-categories/todo.md "dipakai juga oleh dompet dan savings goal".
 *
 * Built once, generic on purpose: nothing here mentions categories,
 * wallets, or savings goals specifically, so every module that needs an
 * icon picker (this task, then wallets and savings goals) imports the same
 * `ICONS` / `ICON_GROUPS` / `Icon` instead of inventing its own name→
 * component mapping. ~60 icons, curated for legibility at ~20px and
 * relevance to Indonesian personal finance, grouped thematically for the
 * picker UI.
 *
 * Every icon is imported BY NAME below — never
 * `import * as Icons from 'lucide-react'` with a dynamic `Icons[name]`
 * lookup. A namespace import defeats tree-shaking: the bundler can no
 * longer prove which of lucide's 4000+ icons are actually reachable, and
 * ships the whole library. Explicit named imports keep the bundle limited
 * to exactly the ~60 icons this file curates.
 *
 * `IconName` is a plain kebab-case string (matches the `icon` TEXT column
 * on `categories` / `wallets` / `savings_goals` — docs/04-database-schema.md
 * §5, §6, §8), not the PascalCase lucide export name, so a value read
 * straight out of the database is already a valid `IconName`.
 */
import { createElement } from 'react';
import {
  Baby,
  Backpack,
  Banknote,
  Beer,
  Bike,
  BookOpen,
  Briefcase,
  Building,
  Building2,
  Bus,
  Cake,
  Camera,
  Car,
  Coffee,
  Coins,
  CreditCard,
  Dog,
  Droplet,
  Dumbbell,
  Film,
  Flame,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Music,
  MoreHorizontal,
  Package,
  Pencil,
  Pill,
  PiggyBank,
  Pizza,
  Plane,
  Popcorn,
  Receipt,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Star,
  Stethoscope,
  Store,
  Syringe,
  Tag,
  Target,
  Ticket,
  TrainFront,
  TrendingUp,
  Tv,
  Umbrella,
  Users,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

export type IconGroup =
  | 'uang'
  | 'makanan'
  | 'transportasi'
  | 'belanja'
  | 'rumah'
  | 'kesehatan'
  | 'pendidikan'
  | 'hiburan'
  | 'pekerjaan'
  | 'keluarga'
  | 'umum';

const GROUP_LABEL: Record<IconGroup, string> = {
  uang: 'Uang & Keuangan',
  makanan: 'Makanan & Minuman',
  transportasi: 'Transportasi',
  belanja: 'Belanja',
  rumah: 'Rumah & Tagihan',
  kesehatan: 'Kesehatan',
  pendidikan: 'Pendidikan',
  hiburan: 'Hiburan',
  pekerjaan: 'Pekerjaan & Bisnis',
  keluarga: 'Keluarga & Sosial',
  umum: 'Umum',
};

interface IconDef {
  name: string;
  label: string;
  group: IconGroup;
  component: LucideIcon;
  /** Extra Indonesian/English search terms beyond `name` and `label`. */
  keywords?: readonly string[];
}

// Curated set — 60 icons across 11 themed groups. Every icon referenced by
// CATEGORY_CATALOG (src/lib/db/seed/categories.ts) and the `icon` column
// defaults on categories/savings_goals ('tag', 'target') MUST appear here.
const ICON_DEFS = [
  // Uang & Keuangan (8)
  {
    name: 'wallet',
    label: 'Dompet',
    group: 'uang',
    component: Wallet,
    keywords: ['gaji', 'income'],
  },
  {
    name: 'piggy-bank',
    label: 'Celengan',
    group: 'uang',
    component: PiggyBank,
    keywords: ['tabungan', 'savings'],
  },
  {
    name: 'banknote',
    label: 'Uang Tunai',
    group: 'uang',
    component: Banknote,
    keywords: ['cash', 'rupiah'],
  },
  {
    name: 'credit-card',
    label: 'Kartu Kredit',
    group: 'uang',
    component: CreditCard,
    keywords: ['kartu', 'debit'],
  },
  {
    name: 'landmark',
    label: 'Bank',
    group: 'uang',
    component: Landmark,
    keywords: ['institusi', 'rekening'],
  },
  { name: 'coins', label: 'Koin', group: 'uang', component: Coins, keywords: ['uang receh'] },
  {
    name: 'receipt',
    label: 'Tagihan',
    group: 'uang',
    component: Receipt,
    keywords: ['struk', 'bon'],
  },
  {
    name: 'trending-up',
    label: 'Investasi',
    group: 'uang',
    component: TrendingUp,
    keywords: ['saham', 'return'],
  },

  // Makanan & Minuman (6)
  {
    name: 'utensils',
    label: 'Makan & Minum',
    group: 'makanan',
    component: Utensils,
    keywords: ['restoran', 'makanan'],
  },
  {
    name: 'coffee',
    label: 'Kopi',
    group: 'makanan',
    component: Coffee,
    keywords: ['kafe', 'minuman'],
  },
  { name: 'pizza', label: 'Pizza', group: 'makanan', component: Pizza, keywords: ['fast food'] },
  {
    name: 'beer',
    label: 'Bir',
    group: 'makanan',
    component: Beer,
    keywords: ['minuman', 'alkohol'],
  },
  {
    name: 'popcorn',
    label: 'Hiburan',
    group: 'makanan',
    component: Popcorn,
    keywords: ['bioskop', 'camilan'],
  },
  {
    name: 'cake',
    label: 'Kue',
    group: 'makanan',
    component: Cake,
    keywords: ['ulang tahun', 'dessert'],
  },

  // Transportasi (5)
  {
    name: 'car',
    label: 'Mobil',
    group: 'transportasi',
    component: Car,
    keywords: ['bensin', 'parkir'],
  },
  { name: 'bus', label: 'Bus', group: 'transportasi', component: Bus, keywords: ['angkutan umum'] },
  {
    name: 'train-front',
    label: 'Kereta',
    group: 'transportasi',
    component: TrainFront,
    keywords: ['krl', 'commuter'],
  },
  {
    name: 'plane',
    label: 'Pesawat',
    group: 'transportasi',
    component: Plane,
    keywords: ['tiket', 'perjalanan'],
  },
  {
    name: 'bike',
    label: 'Sepeda',
    group: 'transportasi',
    component: Bike,
    keywords: ['motor', 'ojek'],
  },

  // Belanja (6)
  {
    name: 'shopping-bag',
    label: 'Belanja',
    group: 'belanja',
    component: ShoppingBag,
    keywords: ['toko', 'shopping'],
  },
  {
    name: 'shopping-cart',
    label: 'Keranjang',
    group: 'belanja',
    component: ShoppingCart,
    keywords: ['groceries'],
  },
  {
    name: 'store',
    label: 'Toko',
    group: 'belanja',
    component: Store,
    keywords: ['warung', 'ritel'],
  },
  { name: 'gift', label: 'Hadiah', group: 'belanja', component: Gift, keywords: ['kado', 'gift'] },
  {
    name: 'shirt',
    label: 'Pakaian',
    group: 'belanja',
    component: Shirt,
    keywords: ['baju', 'fashion'],
  },
  {
    name: 'package',
    label: 'Paket',
    group: 'belanja',
    component: Package,
    keywords: ['online', 'kiriman'],
  },

  // Rumah & Tagihan (5)
  {
    name: 'home',
    label: 'Rumah',
    group: 'rumah',
    component: Home,
    keywords: ['sewa', 'kontrakan'],
  },
  {
    name: 'zap',
    label: 'Listrik',
    group: 'rumah',
    component: Zap,
    keywords: ['pln', 'electricity'],
  },
  {
    name: 'wifi',
    label: 'Internet',
    group: 'rumah',
    component: Wifi,
    keywords: ['wifi', 'pulsa data'],
  },
  {
    name: 'droplet',
    label: 'Air',
    group: 'rumah',
    component: Droplet,
    keywords: ['pdam', 'water'],
  },
  { name: 'flame', label: 'Gas', group: 'rumah', component: Flame, keywords: ['lpg'] },

  // Kesehatan (6)
  {
    name: 'heart-pulse',
    label: 'Kesehatan',
    group: 'kesehatan',
    component: HeartPulse,
    keywords: ['medis', 'dokter'],
  },
  {
    name: 'pill',
    label: 'Obat',
    group: 'kesehatan',
    component: Pill,
    keywords: ['apotek', 'vitamin'],
  },
  {
    name: 'stethoscope',
    label: 'Dokter',
    group: 'kesehatan',
    component: Stethoscope,
    keywords: ['klinik', 'rumah sakit'],
  },
  {
    name: 'dumbbell',
    label: 'Olahraga',
    group: 'kesehatan',
    component: Dumbbell,
    keywords: ['gym', 'fitness'],
  },
  {
    name: 'syringe',
    label: 'Vaksin',
    group: 'kesehatan',
    component: Syringe,
    keywords: ['suntik', 'imunisasi'],
  },
  {
    name: 'heart',
    label: 'Kesehatan Umum',
    group: 'kesehatan',
    component: Heart,
    keywords: ['sehat'],
  },

  // Pendidikan (4)
  {
    name: 'graduation-cap',
    label: 'Pendidikan',
    group: 'pendidikan',
    component: GraduationCap,
    keywords: ['sekolah', 'kuliah'],
  },
  {
    name: 'book-open',
    label: 'Buku',
    group: 'pendidikan',
    component: BookOpen,
    keywords: ['belajar', 'kursus'],
  },
  {
    name: 'pencil',
    label: 'Alat Tulis',
    group: 'pendidikan',
    component: Pencil,
    keywords: ['sekolah'],
  },
  {
    name: 'backpack',
    label: 'Tas Sekolah',
    group: 'pendidikan',
    component: Backpack,
    keywords: ['ransel'],
  },

  // Hiburan (6)
  {
    name: 'film',
    label: 'Film',
    group: 'hiburan',
    component: Film,
    keywords: ['bioskop', 'movie'],
  },
  {
    name: 'music',
    label: 'Musik',
    group: 'hiburan',
    component: Music,
    keywords: ['lagu', 'streaming'],
  },
  {
    name: 'gamepad-2',
    label: 'Game',
    group: 'hiburan',
    component: Gamepad2,
    keywords: ['gaming', 'konsol'],
  },
  {
    name: 'tv',
    label: 'Televisi',
    group: 'hiburan',
    component: Tv,
    keywords: ['streaming', 'langganan'],
  },
  {
    name: 'ticket',
    label: 'Tiket',
    group: 'hiburan',
    component: Ticket,
    keywords: ['acara', 'event'],
  },
  {
    name: 'camera',
    label: 'Kamera',
    group: 'hiburan',
    component: Camera,
    keywords: ['foto', 'hobi'],
  },

  // Pekerjaan & Bisnis (4)
  {
    name: 'briefcase',
    label: 'Pekerjaan',
    group: 'pekerjaan',
    component: Briefcase,
    keywords: ['kerja', 'kantor'],
  },
  {
    name: 'laptop',
    label: 'Freelance',
    group: 'pekerjaan',
    component: Laptop,
    keywords: ['remote', 'komputer'],
  },
  {
    name: 'building-2',
    label: 'Bisnis',
    group: 'pekerjaan',
    component: Building2,
    keywords: ['usaha', 'kantor'],
  },
  {
    name: 'building',
    label: 'Gedung',
    group: 'pekerjaan',
    component: Building,
    keywords: ['perusahaan'],
  },

  // Keluarga & Sosial (4)
  {
    name: 'users',
    label: 'Keluarga',
    group: 'keluarga',
    component: Users,
    keywords: ['teman', 'sosial'],
  },
  { name: 'baby', label: 'Anak', group: 'keluarga', component: Baby, keywords: ['bayi', 'anak'] },
  {
    name: 'dog',
    label: 'Hewan Peliharaan',
    group: 'keluarga',
    component: Dog,
    keywords: ['kucing', 'pet'],
  },
  {
    name: 'heart-handshake',
    label: 'Donasi',
    group: 'keluarga',
    component: HeartHandshake,
    keywords: ['amal', 'sumbangan'],
  },

  // Umum (6)
  {
    name: 'shield',
    label: 'Asuransi',
    group: 'umum',
    component: Shield,
    keywords: ['proteksi', 'insurance'],
  },
  {
    name: 'umbrella',
    label: 'Perlindungan',
    group: 'umum',
    component: Umbrella,
    keywords: ['darurat', 'proteksi'],
  },
  { name: 'tag', label: 'Label', group: 'umum', component: Tag, keywords: ['kategori', 'default'] },
  {
    name: 'star',
    label: 'Favorit',
    group: 'umum',
    component: Star,
    keywords: ['bintang', 'penting'],
  },
  {
    name: 'target',
    label: 'Target',
    group: 'umum',
    component: Target,
    keywords: ['tujuan', 'goal'],
  },
  {
    name: 'more-horizontal',
    label: 'Lainnya',
    group: 'umum',
    component: MoreHorizontal,
    keywords: ['lain-lain', 'misc'],
  },
] as const satisfies readonly IconDef[];

export type IconName = (typeof ICON_DEFS)[number]['name'];

/**
 * Resolution table for `<Icon name=… />`. Includes one alias beyond the 60
 * curated, picker-visible entries: `dompet`, the literal default value
 * baked into `wallets.icon` (docs/04-database-schema.md §5) since before
 * this file existed — kept resolvable so any wallet row still carrying that
 * default renders correctly, without cluttering the picker grid with a
 * second "wallet" glyph.
 */
export const ICONS: Record<IconName, LucideIcon> & { dompet: LucideIcon } = Object.fromEntries(
  ICON_DEFS.map((def) => [def.name, def.component]),
) as Record<IconName, LucideIcon> & { dompet: LucideIcon };
ICONS.dompet = Wallet;

/** Curated entries grouped for the picker UI, in display order. */
export const ICON_GROUPS: ReadonlyArray<{
  group: IconGroup;
  label: string;
  icons: readonly IconDef[];
}> = (Object.keys(GROUP_LABEL) as IconGroup[]).map((group) => ({
  group,
  label: GROUP_LABEL[group],
  icons: ICON_DEFS.filter((def) => def.group === group),
}));

/** Every curated entry, flat — used for search. */
export const ALL_ICONS: readonly IconDef[] = ICON_DEFS;

/**
 * Case-insensitive substring search over name, label, and keywords.
 * Empty/whitespace query returns the full curated set.
 */
export function searchIcons(query: string): readonly IconDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_ICONS;
  return ALL_ICONS.filter(
    (def) =>
      def.name.includes(q) ||
      def.label.toLowerCase().includes(q) ||
      (def.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false),
  );
}

export function isIconName(value: string): value is IconName {
  return value === 'dompet' || ICON_DEFS.some((def) => def.name === value);
}

export interface IconProps extends Omit<LucideProps, 'ref'> {
  name: IconName;
}

/**
 * Maps `name` → component and renders it. A plain `.ts` file (not `.tsx`,
 * per this module's specified path) can't use JSX syntax, so this calls
 * `createElement` directly instead — functionally identical to
 * `<Component {...props} />`.
 *
 * No Server/Client boundary here: lucide icons are plain function
 * components with no interactivity or hooks, so `<Icon />` works equally
 * well rendered from a Server Component or a Client Component.
 *
 * Decorative by default (`aria-hidden`) since an icon paired with visible
 * text — the common case (category rows, the icon picker's own labeled
 * grid cells) — would otherwise double-announce the same information to a
 * screen reader. Pass `aria-label` to override when the icon IS the only
 * content (e.g. a standalone icon-only button).
 */
export function Icon({ name, ...props }: IconProps) {
  const Component = ICONS[name];
  if (!Component) return null;
  return createElement(Component, { 'aria-hidden': !props['aria-label'], ...props });
}
