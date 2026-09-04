import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { previewInvitationByToken } from '@/lib/services/invitations';
import { assertInviteTokenRateLimit } from '@/lib/auth/invitation-rate-limit';
import { getClientIp } from '@/lib/auth/rate-limit';
import { AppError } from '@/lib/api/errors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AcceptInviteCard } from '@/features/household/components/accept-invite-card';

/**
 * `/invite/[token]` — reachable WITHOUT a session (src/proxy.ts's matcher
 * excludes `/invite`, docs/12-security-and-auth.md §3 Layer 1). This is the
 * page a brand new recipient (no account yet) lands on straight from the
 * invitation email: docs/03-domain-model.md §4.3 "Penerima tanpa akun
 * mendaftar dulu; undangan dicocokkan setelah verifikasi email" — signing
 * in here (Google or magic link, whichever they choose) creates their
 * account via the SAME `createUser` event every other sign-in uses
 * (src/lib/auth/options.ts), then Auth.js redirects back to THIS page
 * (`callbackUrl`), where the now-authenticated branch below picks the
 * invitation back up.
 *
 * Every invalid-token reason (never existed, expired, already used,
 * revoked) renders the exact same "tidak berlaku" state — todo.md:
 * "Undangan tidak berlaku → halaman khusus, pesan seragam" — mirroring
 * `acceptInvitation`'s uniform error at the service layer.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);

  let preview;
  try {
    // A page LOAD with a guessed token is itself a probe — docs/12 §7's "10
    // percobaan token / jam per IP" covers viewing, not just submitting the
    // accept form, so brute-forcing by reloading this page can't bypass the
    // limit `acceptInvitationAction` enforces on submit.
    assertInviteTokenRateLimit(ip);
    preview = await previewInvitationByToken(token);
  } catch (err) {
    if (err instanceof AppError) {
      return <InvalidInvite message={err.message} />;
    }
    throw err;
  }

  if (!preview) {
    return <InvalidInvite />;
  }

  const session = await auth();
  const callbackUrl = `/invite/${token}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      {session?.user ? (
        <AcceptInviteCard
          token={token}
          householdName={preview.householdName}
          inviterName={preview.inviterName}
        />
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-title text-text font-semibold">
              Undangan ke {preview.householdName}
            </h1>
            <p className="text-text-muted text-sm">
              {preview.inviterName} mengundang <strong>{preview.email}</strong> untuk bergabung di
              MyMoney. Masuk atau daftar dengan email tersebut untuk melanjutkan.
            </p>
          </div>
          <p className="text-text-muted rounded-inner bg-surface-raised p-3 text-sm">
            Bergabung tidak membagikan data keuangan Anda.
          </p>
          <Button asChild className="w-full">
            <Link href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
              Masuk atau daftar
            </Link>
          </Button>
        </Card>
      )}
    </main>
  );
}

function InvalidInvite({ message }: { message?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <Card className="flex flex-col gap-2 text-center">
        <h1 className="text-title text-text font-semibold">Undangan tidak berlaku</h1>
        <p className="text-text-muted text-sm">
          {message ??
            'Tautan ini sudah tidak berlaku — mungkin sudah dipakai, dibatalkan, atau kedaluwarsa. Minta undangan baru dari pemilik keluarga.'}
        </p>
      </Card>
    </main>
  );
}
