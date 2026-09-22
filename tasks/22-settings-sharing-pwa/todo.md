# Todo — 22 Settings, Sharing & PWA

## Settings

- [x] `/settings` — daftar kelompok
- [x] `/settings/profile` — nama, email (baca saja), avatar
- [x] Preferensi: zona waktu (IANA), dompet default, piutang sebagai aset
- [x] Mengubah zona waktu memperbarui pengelompokan tanggal di seluruh aplikasi
- [x] `/settings/data` — ekspor CSV, hapus akun
- [x] Tentang: versi, tautan docs, catatan lisensi

## Sharing (penyempurnaan)

- [x] `/settings/sharing` mencakup **seluruh** jenis item: dompet, aset, emas, deposito, hutang, piutang, savings goal
- [x] Bagian transaksi bertanda dengan jumlah + tautan
- [x] Cabut per baris, tanpa dialog
- [x] "Berhenti berbagi semuanya" + konfirmasi jumlah
- [x] **Verifikasi: tidak ada tombol "bagikan semuanya" di mana pun**
- [x] Empty state: "Semua data Anda privat"

## Hapus Akun

- [x] `deleteAccountAction` — cascade penuh, segera
- [x] **Blokir bila masih `owner` household aktif**
- [x] Pesan menyebut household mana + tautan ke alih kepemilikan / arsipkan
- [x] Dialog: ketik email untuk konfirmasi
- [x] Test: transaksi anggota lain tidak ikut terhapus
- [x] Test: seluruh data user terhapus (dompet, ledger, aset, hutang, keanggotaan)

## Manifest

- [x] `src/app/manifest.ts` sesuai [docs/13 §8](../../docs/13-deployment-vercel.md#8-pwa)
- [x] Ikon 192, 512, maskable 512
- [x] `theme_color` cocok dengan token merek
- [x] `display: standalone`, `orientation: portrait`

## Service Worker

- [x] Cache shell aplikasi & aset statis (cache-first)
- [x] Data dinamis network-first, fallback cache
- [x] **Tanpa antrean tulis offline**
- [x] Versioning cache; hapus cache lama saat aktivasi
- [x] Registrasi di `layout.tsx`, hanya di produksi

## Offline

- [x] Deteksi status jaringan
- [x] Banner "Offline — data per {waktu}"
- [x] Blokir pengiriman form: "Butuh koneksi untuk menyimpan"
- [x] Kembali online: banner hilang + segarkan otomatis
- [x] Koneksi lambat > 3 s: "Koneksi lambat…" (via Network Information API — lihat catatan deviasi di laporan akhir)

## Test

- [x] Integration: hapus akun menghapus seluruh data user
- [x] Integration: hapus akun diblokir saat masih owner
- [x] Integration: hapus akun tidak menyentuh data anggota lain
- [x] Integration: mengubah zona waktu mengubah pengelompokan tanggal
- [x] Integration: "berhenti berbagi semuanya" mencabut seluruh grant
- [x] E2E: mode offline → banner tampil, data ter-cache terlihat
- [x] E2E: offline → coba simpan → diblokir dengan pesan
- [x] E2E: kembali online → banner hilang, data segar
- [x] E2E: cabut berbagi dari `/settings/sharing` → berlaku seketika
- [x] E2E: axe pada seluruh rute settings

## Verifikasi Akhir

- [x] `npm run verify` hijau — dikonfirmasi oleh coordinator: 77/77 file test, 956/956 test lulus, typecheck & lint bersih (setelah perbaikan bug `deleteAccount` pada household arsip).
- [ ] Lighthouse PWA: installable
- [ ] Install di perangkat Android sungguhan, buka dari home screen
- [ ] Install di iOS Safari (Add to Home Screen)
- [ ] Periksa manual: matikan jaringan → aplikasi tetap terbuka dengan banner
