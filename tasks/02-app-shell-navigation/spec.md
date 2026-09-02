# Task 02 — App Shell & Navigation

**Fase:** F0 · **Bergantung pada:** 01 · **Dokumen:** [02-information-architecture](../../docs/02-information-architecture.md), [10-ux-states](../../docs/10-ux-states.md)

## Objektif

Membangun kerangka aplikasi: navigasi mobile dan desktop, batas error dan loading, serta anggaran performa yang ditegakkan CI.

Menegakkan anggaran performa **sekarang**, bukan menjelang rilis, adalah keputusan yang disengaja. Regresi performa yang ditemukan satu task setelah munculnya mudah dilacak; yang ditemukan dua puluh task kemudian praktis mustahil.

## Ruang Lingkup

**Termasuk:** bottom nav 5 slot **mengambang berkaca**, sidebar desktop, rail tablet, safe area + `viewport-fit=cover`, meta PWA iOS, error/loading/not-found boundary, Lighthouse CI, test responsif.

**Tidak termasuk:** context switcher household (task 10) · isi halaman (task modulnya) · autentikasi (task 04).

## Navigasi

Sesuai [02-IA §2 dan §4](../../docs/02-information-architecture.md#2-navigasi-mobile). Lima slot: Home · Transaksi · **+** · Kekayaan · Lainnya.

**Aturan yang harus benar sejak awal:**
- FAB **tidak mengubah URL**. Sheet Add Transaction adalah state UI; menaruhnya di URL membuat tombol back terasa aneh.
- Bottom nav punya `padding-bottom: env(safe-area-inset-bottom)`.
- Konten punya `padding-bottom` = tinggi nav + safe area. Item terakhir daftar tidak boleh tertutup nav.
- Nav disembunyikan pada layar full-screen (edit transaksi, onboarding).

Slot **+** di task ini hanya membuka sheet kosong berisi placeholder. Isinya datang di task 07.

## Batas Error & Loading

| Berkas | Fungsi |
|--------|--------|
| `app/error.tsx` | Kegagalan tak tertangani |
| `app/(app)/error.tsx` | Menjaga shell utuh, isi diganti error |
| `app/not-found.tsx` | 404 |
| `loading.tsx` per rute | Skeleton |

Setiap boundary mencatat ke observability dengan nama rute — **tanpa** nominal atau catatan transaksi. Aturan ini ditegakkan sejak sini agar tidak perlu dibersihkan belakangan.

## Anggaran Performa

Sesuai [11-tech §9](../../docs/11-tech-architecture.md#9-performa): LCP < 2,5 s · CLS < 0,1 · JS rute dashboard < 180 KB gzip.

Lighthouse CI berjalan pada preview deployment di setiap PR dan **menggagalkan build** bila anggaran terlampaui.

## Kriteria Penerimaan

- [ ] Bottom nav tampil < 768px, sidebar ≥ 1024px, rail ikon 768–1023px.
- [ ] Item nav aktif tersorot sesuai rute; berfungsi pada nested route.
- [ ] Tap FAB membuka sheet placeholder; URL tidak berubah; back menutup sheet, bukan meninggalkan halaman.
- [ ] Safe area dihormati — diuji pada emulasi iPhone dengan home indicator.
- [ ] Item terakhir pada daftar panjang tidak tertutup bottom nav.
- [ ] Test responsif lulus di 360/375/390/430/768/1024/1440 tanpa horizontal overflow.
- [ ] Error boundary menampilkan pesan yang dapat ditindaklanjuti + tombol coba lagi; shell tetap utuh.
- [ ] Lighthouse CI berjalan di PR dan menggagalkan build saat anggaran terlampaui — dibuktikan dengan sekali sengaja melampaui.
- [ ] Navigasi dapat dioperasikan penuh dengan keyboard; urutan fokus logis.
- [ ] `viewport-fit=cover` terpasang — diverifikasi bahwa `env(safe-area-inset-bottom)` bernilai ≠ 0 pada perangkat ber-home-indicator.
- [ ] Bottom nav memakai material kaca dengan fallback solid.
- [ ] **Maksimal 2 elemen ber-`backdrop-filter` di layar** — diverifikasi lewat audit DOM.
- [ ] Meta PWA iOS terpasang: `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- [ ] `overscroll-behavior-y: none` pada body; pull-to-refresh tidak memicu reload tak sengaja.
- [ ] Scroll performa: daftar 200 item tetap ≥ 55fps di perangkat menengah dengan nav berkaca aktif.
- [ ] Diverifikasi di **Safari iOS dan Chrome Android** — bukan hanya di simulator desktop.

## Verifikasi

```bash
npm run test:e2e     # test responsif + axe + navigasi keyboard
npm run build        # periksa ukuran bundle di output
# PR → periksa laporan Lighthouse CI
```

## Berkas yang Disentuh

Baru: `src/app/layout.tsx` · `src/app/(app)/layout.tsx` · `src/components/layout/{bottom-nav,sidebar,page-header,app-shell}.tsx` · `src/app/error.tsx` · `src/app/(app)/error.tsx` · `src/app/not-found.tsx` · `lighthouse-budget.json` · `.github/workflows/ci.yml` (job lighthouse) · e2e responsif.

## Batasan

**Selalu:** desain dari 360px lebih dulu · `dvh` bukan `vh` untuk tinggi sheet · uji dengan safe area aktif.
**Tanya dulu:** menambah slot nav keenam · mengubah struktur rute dari [02-IA](../../docs/02-information-architecture.md#1-sitemap).
**Jangan:** `overflow-x` pada `body` · menaruh state sheet di URL · mencatat data finansial di error boundary.

## Catatan

Nav menyediakan **tempat** untuk Keluarga di menu "Lainnya" sejak sekarang, tetapi tautannya baru aktif di task 10. Menyiapkan slotnya lebih murah daripada menata ulang menu belakangan.

Alasan Keluarga tidak mendapat slot nav sendiri ada di [02-IA](../../docs/02-information-architecture.md#kenapa-keluarga-tidak-mendapat-slot-sendiri).
