# Task 22 — Settings, Sharing & PWA

**Fase:** F6 · **Bergantung pada:** 19 · **Dokumen:** [09-screen §17–18](../../docs/09-screen-specs.md#17-apa-yang-saya-bagikan--settingssharing), [12-security §11](../../docs/12-security-and-auth.md#11-hak-pengguna-atas-datanya), [13-deployment §8](../../docs/13-deployment-vercel.md#8-pwa)

## Objektif

Melengkapi kendali pengguna atas datanya, dan menjadikan aplikasi installable.

## Ruang Lingkup

**Termasuk:** halaman settings, penyempurnaan `/settings/sharing`, preferensi, hapus akun, manifest, service worker, banner offline.

**Tidak termasuk:** antrean tulis offline (**ditolak untuk MVP** — lihat ADR-012) · notifikasi push (v1.x).

## Hapus Akun

Segera dan permanen. Tidak ada masa tenggang 30 hari — untuk data finansial, penghapusan yang berarti benar-benar terhapus lebih baik daripada penghapusan yang bisa dibatalkan.

**Diblokir bila user masih `owner` sebuah household aktif.** Layarnya menyebutkan household mana yang menghalangi, dengan tautan langsung ke alih kepemilikan atau arsipkan — bukan sekadar pesan penolakan.

Penghapusan **tidak** menghapus transaksi anggota lain yang kebetulan ditandai ke household yang sama; data itu milik mereka.

## PWA Tanpa Antrean Tulis

Cakupan service worker sengaja dibatasi:

- Shell aplikasi & aset statis: cache-first.
- Data dinamis: network-first, fallback ke cache dengan banner "data per {waktu}".
- **Menyimpan saat offline diblokir** dengan pesan jelas.

Alasannya di [ADR-012](../../docs/16-decision-log.md#adr-012--tanpa-antrean-tulis-offline-di-mvp): tulisan tertunda memerlukan resolusi konflik, dan konflik pada data finansial dapat menghasilkan angka salah atau transaksi ganda. Menolak menyimpan lebih jujur daripada berjanji tersimpan lalu gagal diam-diam.

## Kriteria Penerimaan

- [ ] `/settings` memuat: Profil · Preferensi · Yang Saya Bagikan · Keluarga · Kategori · Dompet · Data · Tentang.
- [ ] Preferensi: zona waktu, dompet default, piutang sebagai aset.
- [ ] Mengubah zona waktu memperbarui seluruh pengelompokan tanggal.
- [ ] `/settings/sharing` menampilkan **seluruh** grant aktif dalam satu layar.
- [ ] Setiap grant dapat dicabut dari sana, tanpa dialog.
- [ ] "Berhenti berbagi semuanya" dengan konfirmasi menyebut jumlah.
- [ ] **Tidak ada tombol "bagikan semuanya"** — asimetri disengaja.
- [ ] Ekspor CSV dari Data.
- [ ] Hapus akun: konfirmasi ketik email, cascade penuh, segera.
- [ ] Hapus akun **diblokir** bila masih owner household aktif, dengan tautan tindakan.
- [ ] Hapus akun tidak menghapus transaksi anggota lain.
- [ ] Manifest lengkap; aplikasi installable di Android & iOS.
- [ ] Ikon 192, 512, dan maskable 512 tersedia.
- [ ] Service worker: cache shell, network-first untuk data.
- [ ] Offline: data ter-cache tampil + banner "Offline — data per {waktu}".
- [ ] Offline: menyimpan diblokir dengan pesan "Butuh koneksi untuk menyimpan".
- [ ] Kembali online: banner hilang, data disegarkan otomatis.
- [ ] Skor Lighthouse PWA memenuhi kriteria installable.

## Verifikasi

```bash
npm run test:e2e     # mode offline, hapus akun diblokir, cabut berbagi
npm run build && npm start   # uji installable di perangkat sungguhan
# Lighthouse → tab PWA
```

## Berkas yang Disentuh

Baru: `src/app/manifest.ts` · `public/sw.js` · `src/features/settings/**` · `src/app/(app)/settings/**` · `public/icons/*` · test.
Diubah: `src/app/layout.tsx` (registrasi SW) · `src/features/sharing/**`.

## Batasan

**Selalu:** mencabut berbagi tanpa dialog · hapus akun segera & permanen · blokir menyimpan saat offline.
**Tanya dulu:** menambah antrean tulis offline · mengubah kebijakan hapus akun.
**Jangan:** tombol "bagikan semuanya" · masa tenggang penghapusan · menjanjikan tersimpan saat offline · menghapus data anggota lain.

## Catatan

`/settings/sharing` sudah dibangun di task 12; di sini ia disempurnakan setelah seluruh jenis item yang dapat dibagikan ada (dompet, aset, deposito, hutang, piutang, savings goal).

Layar ini adalah mitigasi utama untuk satu-satunya baris di model ancaman yang diberi kemungkinan **tinggi**: berbagi berlebihan tanpa sadar. Ia bukan pelengkap.
