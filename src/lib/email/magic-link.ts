/**
 * Magic-link email — SMTP transport (real Gmail account, see .env
 * `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`), wired as `Nodemailer`'s
 * `sendVerificationRequest` in src/lib/auth/options.ts. Fallback sign-in
 * path when Google OAuth's redirect URI can't be registered for a given
 * environment (preview deploys — see tasks/04-authentication/spec.md
 * "Catatan").
 *
 * docs/12-security-and-auth.md §10: never log the email address or the
 * token/url. If `sendMail` throws, the error is allowed to propagate as-is
 * — nodemailer error messages don't embed the message body — and Auth.js
 * itself decides what (if anything) to log about the failure.
 */
import { createTransport } from 'nodemailer';
import { getEnv } from '@/lib/env';

interface SendVerificationRequestParams {
  identifier: string;
  url: string;
  expires: Date;
}

export async function sendMagicLinkEmail({
  identifier: email,
  url,
}: SendVerificationRequestParams): Promise<void> {
  const env = getEnv();
  const { host } = new URL(url);

  const transport = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  const result = await transport.sendMail({
    to: email,
    from: env.EMAIL_FROM,
    subject: 'Tautan masuk ke MyMoney',
    text: textBody({ url, host }),
    html: htmlBody({ url, host }),
  });

  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
  if (failed.length > 0) {
    throw new Error(`sendMagicLinkEmail: delivery failed for ${failed.length} recipient(s)`);
  }
}

function textBody({ url, host }: { url: string; host: string }): string {
  return [
    `Masuk ke ${host}`,
    '',
    `Klik tautan berikut untuk masuk ke akun MyMoney Anda:`,
    url,
    '',
    'Tautan ini hanya berlaku sekali dan kedaluwarsa dalam waktu singkat.',
    'Jika Anda tidak meminta ini, abaikan email ini — tidak ada tindakan yang diperlukan.',
  ].join('\n');
}

function htmlBody({ url, host }: { url: string; host: string }): string {
  const escapedHost = escapeHtml(host);
  return `
<body style="background: #f4f4f5; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="padding: 32px; text-align: center;">
        <h1 style="font-size: 18px; color: #18181b; margin: 0 0 16px;">Masuk ke ${escapedHost}</h1>
        <p style="font-size: 14px; color: #52525b; margin: 0 0 24px;">
          Klik tombol di bawah untuk masuk ke akun MyMoney Anda.
        </p>
        <a href="${url}"
           style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Masuk ke MyMoney
        </a>
        <p style="font-size: 12px; color: #a1a1aa; margin: 24px 0 0;">
          Tautan ini hanya berlaku sekali dan kedaluwarsa dalam waktu singkat.
          Jika Anda tidak meminta ini, abaikan email ini.
        </p>
      </td>
    </tr>
  </table>
</body>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
