# Todo — 22 Settings, Sharing & PWA

## Settings

- [ ] `/settings` — daftar kelompok
- [ ] `/settings/profile` — nama, email (baca saja), avatar
- [ ] Preferensi: zona waktu (IANA), dompet default, piutang sebagai aset
- [ ] Mengubah zona waktu memperbarui pengelompokan tanggal di seluruh aplikasi
- [ ] `/settings/data` — ekspor CSV, hapus akun
- [ ] Tentang: versi, tautan docs, catatan lisensi

## Sharing (penyempurnaan)

- [ ] `/settings/sharing` mencakup **seluruh** jenis item: dompet, aset, emas, deposito, hutang, piutang, savings goal
- [ ] Bagian transaksi bertanda dengan jumlah + tautan
- [ ] Cabut per baris, tanpa dialog
- [ ] "Berhenti berbagi semuanya" + konfirmasi jumlah
- [ ] **Verifikasi: tidak ada tombol "bagikan semuanya" di mana pun**
- [ ] Empty state: "Semua data Anda privat"

## Hapus Akun

- [ ] `deleteAccountAction` — cascade penuh, segera
- [ ] **Blokir bila masih `owner` household aktif**
- [ ] Pesan menyebut household mana + tautan ke alih kepemilikan / arsipkan
- [ ] Dialog: ketik email untuk konfirmasi
- [ ] Test: transaksi anggota lain tidak ikut terhapus
- [ ] Test: seluruh data user terhapus (dompet, ledger, aset, hutang, keanggotaan)

## Manifest

- [ ] `src/app/manifest.ts` sesuai [docs/13 §8](../../docs/13-deployment-vercel.md#8-pwa)
- [ ] Ikon 192, 512, maskable 512
- [ ] `theme_color` cocok dengan token merek
- [ ] `display: standalone`, `orientation: portrait`

## Service Worker

- [ ] Cache shell aplikasi & aset statis (cache-first)
- [ ] Data dinamis network-first, fallback cache
- [ ] **Tanpa antrean tulis offline**
- [ ] Versioning cache; hapus cache lama saat aktivasi
- [ ] Registrasi di `layout.tsx`, hanya di produksi

## Offline

- [ ] Deteksi status jaringan
- [ ] Banner "Offline — data per {waktu}"
- [ ] Blokir pengiriman form: "Butuh koneksi untuk menyimpan"
- [ ] Kembali online: banner hilang + segarkan otomatis
- [ ] Koneksi lambat > 3 s: "Koneksi lambat…"

## Test

- [ ] Integration: hapus akun menghapus seluruh data user
- [ ] Integration: hapus akun diblokir saat masih owner
- [ ] Integration: hapus akun tidak menyentuh data anggota lain
- [ ] Integration: mengubah zona waktu mengubah pengelompokan tanggal
- [ ] Integration: "berhenti berbagi semuanya" mencabut seluruh grant
- [ ] E2E: mode offline → banner tampil, data ter-cache terlihat
- [ ] E2E: offline → coba simpan → diblokir dengan pesan
- [ ] E2E: kembali online → banner hilang, data segar
- [ ] E2E: cabut berbagi dari `/settings/sharing` → berlaku seketika
- [ ] E2E: axe pada seluruh rute settings

## Verifikasi Akhir

- [ ] `npm run verify` hijau
- [ ] Lighthouse PWA: installable
- [ ] Install di perangkat Android sungguhan, buka dari home screen
- [ ] Install di iOS Safari (Add to Home Screen)
- [ ] Periksa manual: matikan jaringan → aplikasi tetap terbuka dengan banner
