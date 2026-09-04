/**
 * Household invitation email — same SMTP transport as
 * src/lib/email/magic-link.ts (task 04's real Gmail account; see .env
 * `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`), NOT Resend — task 11's
 * instructions are explicit that this reuses the existing magic-link
 * transport rather than standing up a second email provider. `RESEND_API_KEY`
 * stays unused (src/lib/env.ts).
 *
 * docs/03-domain-model.md §"Keamanan Undangan" / docs/12-security-and-auth.md
 * §10: "Email undangan hanya memuat nama household dan nama pengundang —
 * tidak pernah data finansial." This module's function signature is the
 * enforcement mechanism — it structurally cannot receive an amount, balance,
 * or transaction, because nothing here accepts one. Never log the token,
 * the recipient email, the household name, or the inviter's name (docs/12
 * §10 — household/member names are on the never-log list).
 */
import { createTransport } from 'nodemailer';
import { getEnv } from '@/lib/env';
import { emailLayout } from './templates';

export interface SendInvitationEmailInput {
  to: string;
  householdName: string;
  inviterName: string;
  /** Raw token — exists only here and in the outgoing email. Never logged,
   * never returned to a caller that might log it. */
  token: string;
  expiresAt: Date;
}

const EXPIRY_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

export async function sendInvitationEmail({
  to,
  householdName,
  inviterName,
  token,
  expiresAt,
}: SendInvitationEmailInput): Promise<void> {
  const env = getEnv();
  const url = `${env.APP_URL}/invite/${token}`;
  const expiresLabel = `${EXPIRY_FORMATTER.format(expiresAt)} WIB`;

  const transport = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  const result = await transport.sendMail({
    to,
    from: env.EMAIL_FROM,
    subject: `${inviterName} mengundang Anda ke ${householdName} di MyMoney`,
    text: textBody({ householdName, inviterName, url, expiresLabel }),
    html: htmlBody({ householdName, inviterName, url, expiresLabel }),
  });

  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
  if (failed.length > 0) {
    throw new Error(`sendInvitationEmail: delivery failed for ${failed.length} recipient(s)`);
  }
}

function textBody({
  householdName,
  inviterName,
  url,
  expiresLabel,
}: {
  householdName: string;
  inviterName: string;
  url: string;
  expiresLabel: string;
}): string {
  return [
    `${inviterName} mengundang Anda untuk bergabung ke ${householdName} di MyMoney.`,
    '',
    'Bergabung tidak membagikan data keuangan Anda — Anda tetap memilih apa yang ditandai atau dibagikan setelah bergabung.',
    '',
    `Terima undangan: ${url}`,
    '',
    `Tautan ini berlaku sampai ${expiresLabel} dan hanya dapat dipakai sekali.`,
    'Jika Anda tidak mengenal pengirimnya, abaikan email ini — tidak ada tindakan yang diperlukan.',
  ].join('\n');
}

function htmlBody({
  householdName,
  inviterName,
  url,
  expiresLabel,
}: {
  householdName: string;
  inviterName: string;
  url: string;
  expiresLabel: string;
}): string {
  return emailLayout({
    heading: `Undangan ke ${householdName}`,
    paragraphs: [
      `${inviterName} mengundang Anda untuk bergabung ke ${householdName} di MyMoney.`,
      'Bergabung tidak membagikan data keuangan Anda — Anda tetap memilih apa yang ditandai atau dibagikan setelah bergabung.',
    ],
    cta: { label: 'Terima Undangan', url },
    footnote: `Tautan ini berlaku sampai ${expiresLabel} dan hanya dapat dipakai sekali. Jika Anda tidak mengenal pengirimnya, abaikan email ini.`,
  });
}
