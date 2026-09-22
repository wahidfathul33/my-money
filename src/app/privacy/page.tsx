import Link from 'next/link';

/**
 * Static, unauthenticated privacy policy — tasks/23-hardening-and-launch/todo.md
 * "Audit Legal: Kebijakan privasi & ketentuan layanan tersedia". Excluded
 * from src/proxy.ts's matcher (same reasoning as /signin and /invite: must
 * be reachable before sign-in).
 *
 * Content is a factual description of what this codebase actually does —
 * every claim below traces to a real, already-implemented mechanism (cited
 * inline) rather than aspirational legal boilerplate. It is NOT a
 * substitute for review by an actual lawyer before a real production
 * launch — see LAUNCH-CHECKLIST.md's "Deferred to deployment" section,
 * which flags that review explicitly. Task 23's own scope boundary
 * ("tidak menambah fitur") is why this is a static page with no settings,
 * consent flows, or data-request tooling beyond what already exists
 * (Ekspor/Hapus akun in Settings, per docs/12-security-and-auth.md §11).
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/signin" className="text-brand-readable text-sm font-medium">
          &larr; Kembali
        </Link>
        <h1 className="text-title text-text mt-2 font-semibold">Kebijakan Privasi</h1>
        <p className="text-text-muted mt-1 text-sm">
          Berlaku untuk MyMoney. Dokumen ini menjelaskan bagaimana data Anda ditangani, sesuai
          dengan cara aplikasi ini benar-benar bekerja.
        </p>
      </div>

      <Section title="Data yang kami simpan">
        <p>
          Akun (nama, email, foto dari penyedia masuk), dompet, kategori, transaksi, aset (emas,
          deposito), hutang dan piutang, budget, dan tujuan tabungan yang Anda catat sendiri.
          Semua nominal tersimpan sebagai milik satu akun — tidak pernah rekening bersama.
        </p>
      </Section>

      <Section title="Cara masuk">
        <p>
          Google OAuth atau tautan sekali pakai lewat email. Kami tidak pernah menyimpan kata
          sandi Anda.
        </p>
      </Section>

      <Section title="Berbagi dalam household">
        <p>
          Bergabung ke sebuah household (keluarga) tidak membagikan data apa pun secara otomatis.
          Berbagi bersifat eksplisit dan dapat dicabut kapan saja lewat{' '}
          <span className="font-medium">Pengaturan &rarr; Berbagi</span> — baik per transaksi
          maupun lewat sakelar kekayaan bersama. Anggota yang dikeluarkan dari household kehilangan
          seluruh akses seketika.
        </p>
      </Section>

      <Section title="Yang tidak pernah kami lakukan">
        <ul className="list-disc space-y-1 pl-5">
          <li>Menjual atau membagikan data Anda ke pihak ketiga untuk iklan.</li>
          <li>Mencatat nominal, saldo, atau nama Anda ke sistem pemantauan error/analitik.</li>
          <li>Melihat isi dompet pribadi Anda tanpa Anda mengizinkannya secara eksplisit.</li>
        </ul>
      </Section>

      <Section title="Pemantauan teknis">
        <p>
          Kami memakai pemantauan error dan performa standar (lihat docs/13-deployment-vercel.md
          §9 di repositori) untuk menjaga aplikasi tetap berjalan. Data finansial, nama household,
          dan nama anggota disaring sebelum meninggalkan server — lihat mekanisme scrubbing di
          src/lib/observability/scrubber.ts.
        </p>
      </Section>

      <Section title="Hak Anda atas data">
        <p>
          Ekspor seluruh data Anda ke CSV, atau hapus akun Anda secara permanen, kapan saja lewat
          Pengaturan. Menghapus akun tidak menghapus data anggota household lain.
        </p>
      </Section>

      <p className="text-text-muted text-xs">
        Dokumen ini adalah draf teknis yang mencerminkan perilaku aplikasi saat ini, disiapkan
        sebagai bagian dari audit hardening pra-peluncuran — belum ditinjau oleh penasihat hukum.
        Lihat LAUNCH-CHECKLIST.md untuk status peninjauannya.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-text text-sm font-semibold">{title}</h2>
      <div className="text-text-muted text-sm leading-relaxed">{children}</div>
    </section>
  );
}
