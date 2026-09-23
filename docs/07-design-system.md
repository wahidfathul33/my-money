# 07 — Design System

Token, material, gerak, dan komponen. Tailwind CSS v4 dengan token `@theme`; primitif dari Radix UI.

Bahasa yang muncul di dalam komponen diatur [08-copywriting](08-copywriting.md). Dokumen ini hanya mengatur bentuk, warna, dan perilakunya.

## 1. Arah Desain

**Aplikasi finansial konsumen modern dengan kerajinan setara aplikasi iOS bawaan.**

Identitas visualnya milik sendiri — tipografi, warna, dan tata letaknya tidak meniru Apple. Yang diadopsi adalah **kerajinannya**: material berlapis, radius konsentris, fisika gerak yang terasa punya massa, disiplin safe-area, dan target sentuh yang tidak pernah meleset.

Ini keputusan sadar. Meniru chrome iOS secara harfiah di web menghasilkan *uncanny valley* — mirip tapi tidak persis, dan setiap ketidaksamaan kecil justru terasa murah. Sementara di Android, chrome iOS terasa asing. Alasan lengkapnya di [ADR-031](16-decision-log.md#adr-031--fintech-modern-dengan-kerajinan-ios-bukan-tiruan-ios).

**Lima sifat yang harus terasa:**

| Sifat | Wujud konkretnya |
|-------|------------------|
| **Angka adalah pahlawannya** | Tipografi melayani keterbacaan nominal lebih dulu, teks kemudian |
| **Berlapis, bukan datar** | Konten mengalir di bawah kontrol mengambang; kedalaman lewat material, bukan garis |
| **Fisik** | Gerak memakai pegas, bukan kurva linear. Sheet punya momentum dan tahanan |
| **Tenang** | Satu warna aksen. Warna lain hanya bila membawa makna finansial |
| **Tidak pernah meleset** | Target ≥ 44px, aksi primer dalam jangkauan ibu jari, tanpa geser tak terduga |

**Yang dihindari:** gradien dekoratif · tumpukan kartu · dashboard padat · chart berlebihan · shadow tebal · radius yang tidak konsisten · animasi yang menunda pembacaan angka.

## 2. Basis CSS

Seluruh efek di dokumen ini dikerjakan **CSS**, dan hanya memakai fitur yang tersedia di **kedua** mesin — WebKit (iOS) dan Blink (Android/Chrome). Tidak ada fitur yang hanya jalan di satu sisi, tidak ada polyfill, tidak ada library animasi.

**Ambang dukungan: Safari 17.4+ · Chrome 120+.**

| Fitur | Dipakai untuk |
|-------|---------------|
| `oklch()` | Seluruh token warna |
| `color-mix()` | State layer (hover/press) diturunkan dari token, bukan token baru |
| `backdrop-filter` | Material kaca — dengan `-webkit-` untuk Safari lama |
| `linear()` easing | Kurva pegas tanpa JS |
| `@starting-style` + `transition-behavior: allow-discrete` | Animasi masuk/keluar sheet & dialog tanpa JS |
| Popover API | Menu, tooltip, context switcher — top layer tanpa manajemen z-index |
| Container queries | Komponen responsif terhadap wadahnya, bukan viewport |
| `:has()` | State turunan tanpa menambah class dari JS |
| `@property` | Custom property yang dapat dianimasikan (sparkline, progress) |
| `dvh` | Tinggi sheet yang benar saat bilah URL menyusut |
| `overscroll-behavior` | Scroll tidak bocor dari sheet ke halaman |
| `scroll-snap` | Pemilih periode, carousel kartu |
| `text-wrap: balance` | Judul dua baris tidak menyisakan satu kata di baris kedua |
| Properti `scale` / `translate` terpisah | Umpan balik tekan tanpa menimpa `transform` lain |
| `prefers-reduced-motion` · `prefers-reduced-transparency` · `prefers-color-scheme` | Menghormati preferensi sistem |

### 2.1 Yang sengaja tidak dipakai

| Fitur | Alasan |
|-------|--------|
| `corner-shape: superellipse()` | Hanya satu mesin. Sudut kontinu iOS tidak dapat direplikasi lintas platform — kita pakai radius biasa dan konsisten |
| View Transitions | Dukungan dan perilakunya belum setara di kedua mesin |
| `animation-timeline: scroll()` | Hanya satu mesin |
| `field-sizing: content` | Hanya satu mesin |
| Vibration API (haptik) | Tidak ada di iOS Safari — lihat §9 |
| Library animasi JS | Pegas sudah dapat dinyatakan lewat `linear()`; menambah runtime hanya menambah bundle |

Aturannya: **kalau sebuah efek butuh fitur yang timpang, efeknya yang diganti — bukan platformnya yang dikorbankan.** Hasilnya harus terlihat sama di iPhone dan di Android menengah.

## 3. Material & Elevasi

Tiga tingkat permukaan. Hanya satu yang memakai efek kaca.

| Tingkat | Dipakai untuk | Material |
|---------|---------------|----------|
| **Base** | Latar halaman | Warna solid |
| **Raised** | Kartu, tile, baris daftar | Solid + shadow lembut |
| **Floating** | Bottom nav, sheet, sticky header, dialog, toast | **Kaca** — translusen + blur |

### 3.1 Aturan kaca

> `backdrop-filter` hanya pada elemen mengambang yang **jumlahnya tetap**: bottom nav, bottom sheet, sticky header, dialog, dan toast. Tidak pernah pada kartu, tile, atau item daftar.

Alasannya bukan selera. `backdrop-filter` memaksa browser me-rasterisasi ulang area di belakangnya setiap frame. Pada elemen berjumlah tetap (paling banyak dua di layar), biayanya dapat diprediksi. Pada daftar transaksi yang di-scroll, biayanya tumbuh seiring data — dan anggaran LCP kita diukur di perangkat menengah.

```css
@theme {
  --material-blur: 24px;
  --material-saturate: 180%;
}

.material-glass {
  background: color-mix(in oklch, var(--color-surface) 72%, transparent);
  -webkit-backdrop-filter: blur(var(--material-blur)) saturate(var(--material-saturate));
          backdrop-filter: blur(var(--material-blur)) saturate(var(--material-saturate));
  border-top: 0.5px solid color-mix(in oklch, var(--color-border) 60%, transparent);
}

/* Tanpa dukungan → permukaan solid, bukan transparan tanpa blur */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .material-glass { background: var(--color-surface); }
}

/* Hemat daya / preferensi pengguna → jangan bayar biaya blur */
@media (prefers-reduced-transparency: reduce) {
  .material-glass {
    background: var(--color-surface);
    -webkit-backdrop-filter: none;
            backdrop-filter: none;
  }
}
```

**`saturate()` bukan hiasan.** Blur murni membuat warna di baliknya terlihat pudar; menaikkan saturasi mengembalikan kesan bahwa konten benar-benar ada di belakang kaca, bukan di balik kain.

**Border 0,5px, bukan 1px.** Pada layar 2×/3×, setengah piksel menghasilkan garis rambut yang memisahkan lapisan tanpa terlihat seperti bingkai.

### 3.2 Shadow

```css
@theme {
  --shadow-raised: 0 1px 2px oklch(21% 0.012 250 / 0.04),
                   0 2px 8px oklch(21% 0.012 250 / 0.06);
  --shadow-float:  0 8px 32px oklch(21% 0.012 250 / 0.12);
  --shadow-fab:    0 6px 16px oklch(58% 0.118 195 / 0.32);
}
```

Di mode gelap, elevasi dinyatakan lewat **kecerahan permukaan**, bukan shadow — shadow praktis tidak terlihat di atas latar gelap. Setiap tingkat naik sekitar 4% lightness.

## 4. Warna

Token semantik, bukan nama warna mentah. Komponen tidak pernah menyebut `blue-500`.

```css
@theme {
  /* Netral — dasar dingin, terasa bersih untuk konteks finansial */
  --color-bg:              oklch(99%  0.002 250);
  --color-surface:         oklch(100% 0     0);
  --color-surface-raised:  oklch(97%  0.003 250);
  --color-border:          oklch(92%  0.004 250);
  --color-separator:       oklch(88%  0.005 250);   /* garis rambut dalam daftar */
  --color-text:            oklch(21%  0.012 250);
  --color-text-muted:      oklch(52%  0.010 250);
  --color-text-subtle:     oklch(65%  0.008 250);
  --color-scrim:           oklch(21%  0.012 250 / 0.32);

  /* Merek — teal, cukup berbeda dari hijau "positif" */
  --color-brand:           oklch(58%  0.118 195);
  --color-brand-hover:     oklch(52%  0.118 195);
  --color-brand-subtle:    oklch(96%  0.028 195);
  --color-on-brand:        oklch(100% 0     0);

  /* Semantik finansial */
  --color-positive:        oklch(58%  0.145 152);
  --color-positive-subtle: oklch(96%  0.035 152);
  --color-negative:        oklch(56%  0.185  25);
  --color-negative-subtle: oklch(96%  0.040  25);
  --color-neutral-flow:    oklch(52%  0.010 250);   /* transfer */

  --color-warning:         oklch(72%  0.150  75);
  --color-warning-subtle:  oklch(96%  0.045  75);
  --color-danger:          oklch(56%  0.185  25);
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg:              oklch(15%  0.010 250);
    --color-surface:         oklch(19%  0.012 250);
    --color-surface-raised:  oklch(23%  0.012 250);
    --color-border:          oklch(28%  0.012 250);
    --color-separator:       oklch(32%  0.012 250);
    --color-text:            oklch(96%  0.004 250);
    --color-text-muted:      oklch(72%  0.010 250);
    --color-text-subtle:     oklch(58%  0.010 250);
    --color-scrim:           oklch(8%   0.010 250 / 0.56);

    --color-brand:           oklch(72%  0.115 195);
    --color-brand-subtle:    oklch(27%  0.045 195);
    --color-positive:        oklch(74%  0.150 152);
    --color-positive-subtle: oklch(25%  0.045 152);
    --color-negative:        oklch(71%  0.160  25);
    --color-negative-subtle: oklch(25%  0.050  25);
  }
}
```

**Kenapa OKLCH?** Terang yang seragam secara perseptual — dua warna dengan L sama benar-benar terasa sama terangnya. Itu membuat pasangan light/dark seimbang tanpa coba-coba, dan mencegah aksen yang menyilaukan di mode gelap.

**Mode gelap bukan inversi.** Latar `15%` bukan hitam murni: hitam murni menghilangkan shadow dan memunculkan smearing OLED saat scroll. Aksen dinaikkan terangnya karena warna jenuh di atas gelap terbaca lebih redup.

**Aturan warna finansial:**
- Pemasukan: `--color-positive`, awalan `+`
- Pengeluaran: `--color-negative`, awalan `−`
- Transfer: `--color-neutral-flow`, **tanpa** tanda
- Warna tidak pernah menjadi satu-satunya penanda — selalu ada tanda atau ikon (WCAG 1.4.1)

## 5. Tipografi

```css
@theme {
  --font-sans: "Inter Variable", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  --text-hero:     2.5rem;    /* 40px — nominal utama dashboard */
  --text-display:  2rem;      /* 32px — nominal besar */
  --text-title:    1.375rem;  /* 22px — judul halaman */
  --text-heading:  1.0625rem; /* 17px — judul bagian */
  --text-body:     1rem;      /* 16px — dasar; batas bawah untuk input */
  --text-sm:       0.875rem;  /* 14px — sekunder */
  --text-xs:       0.75rem;   /* 12px — label, batas terkecil */
}
```

**Tujuh tingkat, tidak lebih.** Setiap ukuran tambahan melemahkan hierarki.

### 5.1 Angka

```css
.font-money {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
  letter-spacing: -0.02em;
}
.text-hero, .text-display { letter-spacing: -0.03em; }
```

`tabular-nums` **wajib** pada setiap nominal. Tanpanya, angka bergeser saat berubah dan kolom nominal pada daftar transaksi tidak sejajar — dua hal yang langsung terbaca sebagai aplikasi yang tidak rapi.

Tracking dirapatkan pada ukuran besar. Pada 40px, jarak huruf default terasa renggang; −0,03em membuatnya terlihat sengaja dibentuk.

### 5.2 Aturan platform

- **Input minimal 16px.** Di bawah itu iOS Safari melakukan zoom otomatis saat field difokuskan — pengalaman yang langsung terasa murahan, dan sering luput karena tidak terjadi di simulator desktop.
- `-webkit-text-size-adjust: 100%` pada `html`, agar iOS tidak membesarkan teks saat orientasi berubah.
- Font dimuat lewat `next/font`, `display: swap`, subset latin, hanya varian variable.

## 6. Bentuk & Radius

### 6.1 Radius konsentris

Radius sudut dalam **mengikuti** sudut luar dikurangi jaraknya:

```
radius_dalam = radius_luar − padding
```

```css
@theme {
  --radius-sheet:  1.5rem;    /* 24px — hanya sudut atas */
  --radius-card:   1rem;      /* 16px */
  --radius-inner:  0.75rem;   /* 12px — di dalam kartu ber-padding 4px */
  --radius-input:  0.75rem;   /* 12px */
  --radius-chip:   9999px;    /* kapsul */
  --radius-full:   9999px;
}
```

Tanpa aturan ini, kartu radius 16px berisi tombol radius 16px akan terlihat "menonjol" di sudutnya — cacat halus yang terasa tanpa bisa ditunjuk. Ini salah satu detail yang membedakan UI yang dikerjakan cermat dari yang tidak.

### 6.2 Kenapa tidak ada sudut kontinu

iOS memakai *superellipse*, bukan busur lingkaran. CSS punya `corner-shape`, tetapi baru di satu mesin — jadi tidak dipakai (§2.1).

Kompensasinya bukan meniru bentuknya, melainkan **konsisten**: radius yang sama untuk peran yang sama, konsentris terhadap wadahnya, dan sedikit lebih besar dari default. Sudut membulat yang konsisten terbaca lebih rapi daripada sudut kontinu yang hanya muncul di separuh perangkat.

**Jangan** menirunya dengan SVG mask atau `clip-path` — biaya rendering-nya nyata, dan perbedaannya hampir tak terlihat pada radius di bawah 24px.

## 7. Spasi & Layout

Skala 4px. Ukuran yang diizinkan: `4 8 12 16 20 24 32 40 48 64`.

```css
@theme {
  --spacing-page-x:  1rem;
  --spacing-section: 1.5rem;
  --spacing-card:    1rem;
  --nav-height:    3.5rem;
  --safe-b:        env(safe-area-inset-bottom, 0px);
  --safe-t:        env(safe-area-inset-top, 0px);
}
```

| Breakpoint | Min | Perlakuan |
|------------|-----|-----------|
| (dasar) | 360px | Target desain utama |
| `sm` | 640px | Ponsel besar / lanskap |
| `md` | 768px | Tablet — rail sidebar |
| `lg` | 1024px | Desktop — sidebar penuh |
| `xl` | 1280px | Konten dibatasi `max-w-5xl` |

Desain dimulai dari 360px. Di ukuran itu tidak boleh ada horizontal overflow, dan tidak boleh ada aksi primer yang butuh scroll untuk dijangkau.

## 8. Gerak

Gerak di aplikasi ini **fisik, bukan dekoratif**. Ia menjelaskan dari mana sesuatu datang dan ke mana perginya.

```css
@theme {
  /* Pegas ringan dengan sedikit overshoot — sheet, kartu, pop-in */
  --ease-spring: linear(
    0, 0.006, 0.024, 0.055, 0.098, 0.152, 0.217, 0.29, 0.371, 0.458,
    0.549, 0.642, 0.735, 0.826, 0.913, 0.993 52%, 1.048, 1.078, 1.085,
    1.073 68%, 1.045, 1.017, 0.998, 0.99 86%, 0.996, 1.001, 1
  );
  /* Keluar-halus — fade, warna, opacity */
  --ease-out-soft: cubic-bezier(0.32, 0.72, 0, 1);

  --dur-instant: 100ms;   /* hover, fokus, warna */
  --dur-fast:    200ms;   /* chip, toggle, tooltip */
  --dur-normal:  300ms;   /* dialog, popover */
  --dur-sheet:   420ms;   /* bottom sheet naik/turun */
}
```

> Nilai `linear()` di atas adalah pendekatan pegas (redaman ~0,7, kekakuan sedang). Ia **harus di-generate ulang dengan tool** saat implementasi dan disetel di perangkat nyata — angka di sini menetapkan karakternya, bukan nilai finalnya.

**Kenapa `linear()` dan bukan `cubic-bezier`?** Kurva bezier tidak dapat melewati nilai akhirnya. Pegas bisa — sedikit melewati lalu kembali, dan itulah yang membuat gerak terasa punya massa. `linear()` dengan banyak titik menirukannya tanpa library JS.

**Aturan:**
- Bottom sheet naik dari bawah dengan `--ease-spring`, `--dur-sheet`. Scrim memudar dengan `--ease-out-soft`.
- **Angka finansial tidak pernah dianimasikan menghitung naik.** Itu membuat orang menunggu untuk membaca angka yang sudah tersedia.
- Perpindahan halaman: fade + geser 8px, bukan slide penuh. Slide penuh di web selalu terlambat satu frame dan justru menonjolkan bahwa ini bukan native.
- Skeleton memakai pulse, bukan shimmer bergerak.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 8.1 Masuk & keluar tanpa JS

Sheet, dialog, toast, dan popover dianimasikan sepenuhnya lewat CSS. Tidak ada library animasi, tidak ada state "sedang menutup" yang harus dikelola JS.

```css
@property --sheet-y {
  syntax: "<length-percentage>"; inherits: false; initial-value: 100%;
}

.sheet {
  translate: 0 0;
  opacity: 1;
  transition:
    translate var(--dur-sheet) var(--ease-spring),
    opacity   var(--dur-fast)  var(--ease-out-soft),
    display   var(--dur-sheet) allow-discrete;   /* kunci: display ikut ditransisikan */
}

/* Keadaan tepat sebelum elemen pertama kali dirender */
@starting-style {
  .sheet { translate: 0 100%; opacity: 0; }
}

/* Keadaan saat ditutup — tanpa allow-discrete, elemen hilang seketika */
.sheet[hidden], .sheet:not(:popover-open) {
  translate: 0 100%;
  opacity: 0;
}
```

`transition-behavior: allow-discrete` adalah bagian yang membuatnya bekerja. Tanpanya, `display: none` berlaku seketika dan animasi keluar tidak pernah terlihat — masalah yang selama ini hanya bisa diselesaikan dengan timer di JS.

**Popover API** dipakai untuk menu, tooltip, dan context switcher. Ia menaruh elemen di *top layer* browser, sehingga tidak ada `z-index` yang perlu dikelola dan tidak ada masalah `overflow: hidden` dari induknya.

```html
<button popovertarget="ctx-switcher">Pribadi</button>
<div id="ctx-switcher" popover="auto">…</div>
```

`popover="auto"` sudah menangani penutupan saat klik di luar dan tombol Esc — perilaku yang biasanya ditulis ulang di setiap proyek.

## 9. Sentuhan

| Aturan | Nilai |
|--------|-------|
| Target sentuh minimum | 44 × 44 px, tanpa kecuali |
| Jarak antar target | ≥ 8px |
| Aksi primer | Sepertiga bawah layar |
| Umpan balik tekan | Skala 0,97 + pergeseran warna, `--dur-instant` |

```css
* { -webkit-tap-highlight-color: transparent; }   /* kotak biru iOS diganti state kita */

button, [role="button"], a {
  touch-action: manipulation;                     /* hilangkan delay 300ms */
  user-select: none;
}
```

### 9.1 Umpan balik tanpa haptik

**Vibration API tidak ada di iOS Safari** — termasuk PWA yang sudah dipasang di layar utama. Karena kita hanya memakai yang tersedia di kedua mesin (§2.1), haptik **tidak dipakai sama sekali**. Bukan "bonus di Android": memakainya di satu platform saja berarti dua kualitas rasa untuk aplikasi yang sama.

Gantinya, umpan balik tekan dikerjakan CSS dan harus terasa langsung:

```css
.pressable {
  scale: 1;
  background-color: var(--surface);
  transition: scale var(--dur-instant) var(--ease-out-soft),
              background-color var(--dur-instant) linear;
}
.pressable:active {
  scale: 0.97;
  /* State layer diturunkan dari token, bukan warna baru */
  background-color: color-mix(in oklch, var(--surface) 92%, var(--color-text));
}

/* Baris daftar: seluruh baris merespons, meski yang ditekan anaknya */
.list-row:has(:active) { background-color: var(--color-surface-raised); }
```

Memakai properti `scale` — bukan `transform: scale()` — agar tidak menimpa `translate` yang mungkin sedang berjalan pada elemen yang sama.

`:has(:active)` menggantikan pola lama "tambahkan class dari JS saat pointerdown". Satu baris CSS, tanpa event listener.

**Aturan:** setiap aksi wajib punya umpan balik visual yang berdiri sendiri dalam < 100 ms. Kalau sebuah interaksi hanya terasa benar dengan getaran, rancangannya yang belum selesai.

## 10. Perilaku Scroll

```css
html { scroll-behavior: smooth; }
body { overscroll-behavior-y: none; }   /* cegah pull-to-refresh tak sengaja */

.sheet-content {
  overscroll-behavior: contain;          /* scroll tidak bocor ke halaman di baliknya */
  max-height: 85dvh;                     /* dvh, bukan vh */
}
```

**`dvh`, bukan `vh`.** Bilah URL browser mobile menyusut dan membesar saat scroll; `vh` mengacu ke viewport terbesar, sehingga konten terpotong. Ini salah satu bug paling sering pada web app mobile.

**`overscroll-behavior: contain` pada sheet** mencegah gerakan scroll di dalam sheet ikut menggeser halaman di belakangnya setelah mencapai ujung — perilaku yang langsung terasa salah di iOS.

## 11. iOS & PWA

Aplikasi ini dipasang ke layar utama. Beberapa hal hanya benar bila diatur eksplisit.

### 11.1 Viewport

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover">
```

`viewport-fit=cover` **wajib** — tanpanya `env(safe-area-inset-*)` selalu bernilai 0, dan seluruh perhitungan safe area diam-diam tidak bekerja.

### 11.2 Safe area

```css
.bottom-nav {
  padding-bottom: var(--safe-b);
  height: calc(var(--nav-height) + var(--safe-b));
}
.page-content  { padding-bottom: calc(var(--nav-height) + var(--safe-b) + 1rem); }
.sticky-header { padding-top: var(--safe-t); }
```

Diuji pada perangkat dengan home indicator **dan** Dynamic Island — keduanya menghasilkan inset yang berbeda.

### 11.3 Standalone

```html
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="MyMoney">
```

`black-translucent` membuat konten mengalir di bawah status bar — benar hanya bila safe area sudah ditangani. Kalau belum, judul halaman akan tertimpa jam.

`apple-touch-icon` dan `apple-touch-startup-image` per ukuran layar disiapkan di [task 22](../tasks/22-settings-sharing-pwa/spec.md). Tanpa startup image, iOS menampilkan layar putih kosong saat aplikasi dibuka dari layar utama.

### 11.4 Yang tidak dijanjikan

Karena kita hanya memakai kemampuan yang ada di kedua mesin, beberapa hal sengaja tidak ada. Dicatat agar tidak muncul di desain lalu gagal saat implementasi:

| Tidak dipakai | Konsekuensi desain |
|---------------|--------------------|
| Haptic feedback | Umpan balik selalu visual, < 100 ms (§9.1) |
| Kontrol warna status bar dinamis | Satu gaya untuk seluruh aplikasi |
| Gestur back dari tepi layar | Tombol back selalu terlihat |
| Sudut kontinu | Radius biasa, konsisten (§6.2) |
| Transisi antar halaman dengan elemen bersama | Fade + geser 8px saja |
| Widget layar utama | Ditunda ke v1.x; butuh native |

Daftar ini pendek dan itu disengaja. Yang hilang semuanya bersifat *tambahan* — tidak ada satu pun yang membuat aplikasi terasa kurang selesai bila tidak ada.

## 12. Anggaran Material

Kaca murah bila terbatas dan mahal bila tidak. Batas berikut ditegakkan review dan diperiksa di [task 02](../tasks/02-app-shell-navigation/spec.md).

| Aturan | Batas |
|--------|-------|
| Elemen ber-`backdrop-filter` di layar | **Maksimal 2** |
| `backdrop-filter` pada item daftar | **Dilarang** |
| Shadow bertumpuk pada satu elemen | Maksimal 2 lapis |
| Properti yang boleh dianimasikan | `transform`, `opacity`, `filter` saja |
| Animasi `width`/`height`/`top`/`left` | **Dilarang** — memicu layout |
| Library animasi JS | **Dilarang** — pegas dinyatakan lewat `linear()` |
| `will-change` | Hanya pada elemen yang benar-benar sedang beranimasi, dilepas setelahnya |

Menganimasikan properti di luar `transform`/`opacity` memaksa browser menghitung ulang tata letak setiap frame. Pada daftar transaksi yang panjang, itu perbedaan antara 60fps dan tersendat.

## 13. Ikon

`lucide-react`. Ukuran 20px (inline), 24px (nav), 32px (empty state & kategori).

Ikon kategori berasal dari **set terkurasi** (~60 ikon), bukan unggahan: bobot visual konsisten, tanpa penyimpanan, tanpa moderasi, dan tidak ada ikon jelek yang merusak tampilan daftar.

Ikon kategori tampil dalam wadah lingkaran berlatar `color-subtle` dengan glif `color` — memberi warna tanpa membuat daftar jadi ramai.

Import per ikon, bukan barrel import, agar tree-shaking bekerja.

## 14. Katalog Komponen

Primitif di `src/components/ui/`, komponen domain di `src/components/finance/`.

### 14.1 Primitif

| Komponen | Varian | Catatan |
|----------|--------|---------|
| `Button` | primary · secondary · ghost · danger × sm/md/lg | Tinggi min 44px pada md |
| `Input` | text · number · money | ≥ 16px; radius `--radius-input` |
| `Select` | — | Radix; menjadi sheet di mobile |
| `Sheet` | bottom · side | Kaca; grabber; `overscroll-behavior: contain` |
| `Dialog` | — | Padanan desktop dari Sheet, komponen yang sama |
| `Card` | flat · raised | Radius konsentris terhadap isinya |
| `Tabs` | underline · segmented | Segmented untuk pemilih jenis transaksi |
| `Chip` | selectable · filter | Kapsul |
| `Progress` | linear · ring | Ring untuk target tabungan |
| `Skeleton` | text · card · list | Pulse, seukuran konten akhir |
| `Toast` | info · success · error | Mengambang di atas nav; mendukung urungkan |
| `EmptyState` | — | Ikon 48px + judul + deskripsi + satu CTA |
| `Avatar`, `Switch`, `Checkbox`, `RadioGroup` | — | Radix |

### 14.2 Sheet — detail yang membuatnya terasa benar

Sheet adalah permukaan paling sering dipakai di aplikasi ini. Detailnya menentukan kesan keseluruhan.

| Perilaku | Aturan |
|----------|--------|
| Tinggi | Satu tinggi tetap per konteks; sheet input transaksi tidak dapat di-resize |
| Grabber | Selalu ada, 36×5px, `--color-separator` |
| Tarik untuk menutup | Dari grabber dan area header; **tidak** dari area konten yang bisa di-scroll |
| Ambang tutup | Tarikan > 25% tinggi sheet, **atau** kecepatan > 500px/s |
| Tahanan | Tarikan melebihi tinggi maksimum bergerak dengan redaman, bukan berhenti mati |
| Scrim | `--color-scrim`, memudar seiring posisi sheet |
| Fokus | Terjebak di dalam sheet; kembali ke pemicu saat ditutup |
| Radius | Hanya sudut atas, `--radius-sheet` |

Ambang berbasis **kecepatan** sama pentingnya dengan berbasis jarak. Tanpanya, gerakan tutup yang cepat dan pendek terasa tidak direspons.

### 14.3 Komponen domain

| Komponen | Fungsi |
|----------|--------|
| `MoneyText` | Menampilkan `bigint` sebagai IDR — tanda, warna, tabular-nums |
| `AmountKeypad` | Keypad numerik di layar dengan `+` / `−` |
| `TransactionItem` | Satu baris riwayat transaksi |
| `TransactionDayGroup` | Header tanggal + subtotal + daftar |
| `WalletCard` | Nama, jenis, saldo, ikon, warna |
| `WalletPicker` | Sheet pemilih dompet |
| `CategoryPicker` | Grid + baris "sering dipakai" |
| `BudgetBar` | Progress dengan ambang warna |
| `GoalRing` | Progress melingkar + persentase |
| `NetWorthHero` | Nominal `--text-hero` + delta + sparkline |
| `AssetRow` | Nama aset, nilai, gain/loss |
| `ObligationRow` | Hutang/piutang: sisa + jatuh tempo |
| `StatTile` | Label + nominal + delta opsional |
| `PeriodPicker` | Navigasi bulan |
| `ContextSwitcher` | Pemilih Pribadi ↔ Keluarga |
| `MemberAvatar` | Inisial + warna deterministik dari user id |
| `MemberBar` | Baris "siapa membayar apa" dengan proporsi |
| `MemberNetWorthRow` | Baris kekayaan per anggota |
| `ShareWealthToggle` | Sakelar berbagi + dialog konfirmasi |
| `CoverageNote` | Penanda cakupan pada total kekayaan keluarga |
| `TransferTargetPicker` | Pilih anggota → pilih dompetnya (tanpa saldo) |
| `PendingLinkBadge` | "Menunggu dicatat {nama}" |
| `RoleBadge` | Lencana pemilik |
| `InvitationRow` | Undangan tertunda + sisa waktu + aksi |

### 14.4 Warna anggota

Setiap anggota mendapat warna deterministik dari `user_id`, dari palet 8 rona yang semuanya lolos kontras di kedua mode. Dipakai konsisten di avatar, bar "siapa membayar apa", dan rincian kontribusi.

Palet anggota **tidak memuat hijau maupun merah** — keduanya sudah bermakna finansial, dan memakainya untuk identitas orang membuat bar "Istri" terbaca seolah bernilai positif atau negatif.

### 14.5 Komponen yang menegakkan kejujuran angka

`CoverageNote` ada bukan karena kebutuhan visual, melainkan karena aturan di [05-financial-integrity §9](05-financial-integrity.md#9-menampilkan-nilai-turunan-dengan-jujur).

Total kekayaan keluarga tidak lengkap menurut konstruksinya — ia menjumlahkan hanya anggota yang berbagi. Karena itu tampilan utamanya adalah rincian per anggota, dan totalnya muncul sebagai baris sekunder yang selalu didampingi cakupan.

Tipe komponen total mewajibkan `coverage` sebagai prop non-opsional. Merender angkanya tanpa cakupan menghasilkan error TypeScript — bukan sekadar pelanggaran konvensi yang bisa lolos review.

### 14.6 Contoh: `MoneyText`

Komponen ini menegakkan cara uang ditampilkan di seluruh aplikasi, dan menjadi acuan gaya untuk komponen lain.

```tsx
// src/components/finance/money-text.tsx
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/finance/money'

type Tone = 'auto' | 'positive' | 'negative' | 'neutral' | 'plain'

interface MoneyTextProps {
  /** Nominal dalam satuan minor (sen). */
  amount: bigint
  /** `auto` menurunkan nada dari tanda; `neutral` untuk transfer. */
  tone?: Tone
  /** Awalan +/− eksplisit. Wajib saat warna membawa makna. */
  showSign?: boolean
  size?: 'sm' | 'md' | 'lg' | 'display' | 'hero'
  className?: string
}

const TONE_CLASS: Record<Exclude<Tone, 'auto'>, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral:  'text-text-muted',
  plain:    'text-text',
}

const SIZE_CLASS = {
  sm:      'text-sm',
  md:      'text-body',
  lg:      'text-title font-semibold',
  display: 'text-display font-semibold',
  hero:    'text-hero font-bold',
} as const

export function MoneyText({
  amount, tone = 'auto', showSign = false, size = 'md', className,
}: MoneyTextProps) {
  const resolved = tone === 'auto'
    ? (amount > 0n ? 'positive' : amount < 0n ? 'negative' : 'plain')
    : tone

  const sign = showSign && amount !== 0n ? (amount > 0n ? '+' : '−') : ''
  const magnitude = amount < 0n ? -amount : amount

  return (
    <span
      className={cn('font-money', TONE_CLASS[resolved], SIZE_CLASS[size], className)}
      // Pembaca layar mendapat kalimat, bukan simbol matematika
      aria-label={`${sign === '+' ? 'masuk' : sign === '−' ? 'keluar' : ''} ${formatIDR(magnitude)}`}
    >
      {sign}{formatIDR(magnitude)}
    </span>
  )
}
```

Konvensi yang terlihat di sini dan berlaku di semua komponen:

- Props bertipe lewat interface bernama, bukan tipe inline.
- Peta varian sebagai konstanta modul, bukan rantai ternary di JSX.
- `cn()` untuk penggabungan class.
- Komentar hanya menjelaskan **kenapa**, bukan **apa**.
- Aksesibilitas ikut di komponen, bukan ditambal belakangan.

Format nominal — pemisah, posisi `Rp`, singkatan — diatur [08-copywriting §4](08-copywriting.md#4-format-angka--tanggal), bukan di sini.

## 15. Aksesibilitas

Target WCAG 2.2 level AA.

| Persyaratan | Implementasi |
|-------------|--------------|
| Target sentuh ≥ 44×44 px | Tinggi minimum di semua kontrol |
| Kontras 4,5:1 / 3:1 | Diverifikasi otomatis dari token, bukan manual |
| Kontras di atas kaca | Diverifikasi terhadap **latar terburuk** yang mungkin lewat di belakangnya |
| Fokus terlihat | Ring 2px `--color-brand`, offset 2px; tidak pernah `outline: none` |
| Warna bukan satu-satunya penanda | Tanda `+`/`−` menyertai setiap nominal berwarna |
| Label form | `<label>` eksplisit, bukan sekadar placeholder |
| Error terhubung | `aria-describedby` ke pesan error |
| Manajemen fokus | Terjebak di sheet; kembali ke pemicu saat ditutup |
| Region live | Toast `aria-live="polite"`, error `assertive` |
| Nominal untuk pembaca layar | `aria-label` naratif seperti pada `MoneyText` |
| Bahasa | `<html lang="id">` |
| Transparansi berkurang | `prefers-reduced-transparency` → permukaan solid |

**Kontras di atas kaca layak diperhatikan.** Teks pada bottom nav berada di atas material translusen — kontrasnya berubah tergantung apa yang sedang di-scroll di belakangnya. Yang diuji adalah kondisi terburuk, bukan latar kosong.

## 16. Mobile-First

Dipaksakan lewat review dan test.

- Setiap komponen ditulis untuk 360px lebih dulu; breakpoint hanya menambah, tidak pernah mengurangi.
- Tidak ada `overflow-x` pada `body`. Konten lebar (tabel, chart) menggulir di dalam wadahnya sendiri.
- Aksi primer berada di sepertiga bawah layar.
- Sheet memakai `dvh`, maksimum `85dvh`.
- Form di mobile: satu kolom, tanpa kecuali.
- `inputmode="decimal"` pada field uang; keypad kustom untuk input transaksi utama.
- Komponen yang dipakai di lebih dari satu lebar wadah memakai **container query**, bukan breakpoint viewport — kartu yang sama harus benar di dashboard penuh maupun di kolom sempit.
- Pemilih periode dan baris chip memakai `scroll-snap-type: x mandatory` agar berhenti rapi, bukan mengambang di tengah.
