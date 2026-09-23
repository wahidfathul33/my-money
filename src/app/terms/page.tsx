import Link from 'next/link';

/**
 * Static, unauthenticated terms of service — tasks/23-hardening-and-launch/todo.md
 * "Audit Legal: Kebijakan privasi & ketentuan layanan tersedia". Same
 * status and caveats as src/app/privacy/page.tsx's doc comment: factual,
 * traceable to real behavior, not a substitute for legal review before a
 * real production launch.
 */
export default function TermsOfServicePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/signin" className="text-brand-readable text-sm font-medium">
          &larr; Kembali
        </Link>
        <h1 className="text-title text-text mt-2 font-semibold">Ketentuan Layanan</h1>
        <p className="text-text-muted mt-1 text-sm">Berlaku untuk MyMoney.</p>
      </div>

      <Section title="Tentang layanan ini">
        <p>
          MyMoney adalah aplikasi pencatatan keuangan pribadi dan keluarga. Aplikasi ini
          menyediakan alat pencatatan dan agregasi — bukan nasihat keuangan, bukan produk
          perbankan, dan tidak terhubung ke rekening bank Anda secara langsung.
        </p>
      </Section>

      <Section title="Akurasi data">
        <p>
          Anda bertanggung jawab atas keakuratan data yang Anda masukkan. Saldo dan kekayaan
          bersih yang ditampilkan dihitung dari catatan yang Anda buat sendiri — bukan hasil
          verifikasi bank.
        </p>
      </Section>

      <Section title="Household dan kepemilikan">
        <p>
          Bergabung ke sebuah household tidak memindahkan kepemilikan dompet, aset, atau hutang
          Anda kepada siapa pun. Mencatat transfer ke anggota household memindahkan dana secara
          nyata dan dicatat di kedua sisi — tindakan ini tidak dapat dibatalkan pihak lain selain
          Anda sendiri dan penerimanya.
        </p>
      </Section>

      <Section title="Penggunaan yang wajar">
        <p>
          Jangan menggunakan layanan ini untuk aktivitas ilegal, atau mencoba mengakses data milik
          pengguna lain di luar mekanisme berbagi yang disediakan aplikasi.
        </p>
      </Section>

      <Section title="Penghentian layanan">
        <p>
          Anda dapat menghapus akun Anda kapan saja lewat Pengaturan. Kami dapat menangguhkan akun
          yang melanggar ketentuan di atas.
        </p>
      </Section>

      <p className="text-text-muted text-xs">
        Dokumen ini adalah draf teknis yang disiapkan sebagai bagian dari audit hardening
        pra-peluncuran — belum ditinjau oleh penasihat hukum. Lihat LAUNCH-CHECKLIST.md untuk
        status peninjauannya.
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
