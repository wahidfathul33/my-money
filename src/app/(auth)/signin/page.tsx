import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { SignInForm } from './signin-form';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect('/');
  }

  const { callbackUrl, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-xl font-semibold">Masuk ke MyMoney</h1>
      <p className="mt-2 text-sm text-zinc-500">Kelola pemasukan, pengeluaran, dan kekayaan bersih Anda.</p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {mapAuthError(error)}
        </p>
      ) : null}
      <SignInForm callbackUrl={callbackUrl ?? '/'} />
    </main>
  );
}

function mapAuthError(code: string): string {
  switch (code) {
    case 'OAuthAccountNotLinked':
      return 'Email ini sudah terdaftar dengan cara masuk yang berbeda.';
    case 'AccessDenied':
      return 'Akses ditolak.';
    case 'Verification':
      return 'Tautan masuk sudah kedaluwarsa atau sudah dipakai. Minta tautan baru.';
    default:
      return 'Terjadi kesalahan saat masuk. Coba lagi.';
  }
}
