// @vitest-environment node
/**
 * Unit test for the invitation email content — docs/12-security-and-auth.md
 * §10 / spec.md: "Email undangan tidak memuat data finansial apa pun —
 * hanya nama household dan nama pengundang." nodemailer's transport is
 * mocked so this never sends real mail; it only inspects what
 * `sendInvitationEmail` WOULD have sent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

// Imported AFTER the mock so the module under test picks up the mocked
// `createTransport`.
const { sendInvitationEmail } = await import('../invitation');

const FINANCIAL_PATTERNS = [
  /rp\s?\d/i, // "Rp1.000.000" style amounts
  /saldo/i,
  /balance/i,
  /transaksi/i,
  /transaction/i,
  /wallet|dompet/i,
];

describe('sendInvitationEmail', () => {
  afterEach(() => {
    sendMail.mockReset();
  });

  it('sends to the invited address with only household + inviter identity, never financial data', async () => {
    sendMail.mockResolvedValue({ rejected: [], pending: [] });

    await sendInvitationEmail({
      to: 'budi@example.invalid',
      householdName: 'Keluarga Wahid',
      inviterName: 'Wahid',
      token: 'raw-token-value-should-never-leak',
      expiresAt: new Date('2026-09-09T00:00:00Z'),
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0]![0];

    expect(call.to).toBe('budi@example.invalid');
    expect(call.subject).toContain('Wahid');
    expect(call.subject).toContain('Keluarga Wahid');

    const bodies = [call.text, call.html];
    for (const body of bodies) {
      expect(body).toContain('Keluarga Wahid');
      expect(body).toContain('Wahid');
      expect(body).toContain('raw-token-value-should-never-leak'); // the link itself
      for (const pattern of FINANCIAL_PATTERNS) {
        expect(body).not.toMatch(pattern);
      }
    }
  });

  it('embeds the raw token in the link, built from APP_URL, never the hash', async () => {
    sendMail.mockResolvedValue({ rejected: [], pending: [] });

    await sendInvitationEmail({
      to: 'budi@example.invalid',
      householdName: 'Keluarga',
      inviterName: 'Wahid',
      token: 'abc123token',
      expiresAt: new Date(),
    });

    const call = sendMail.mock.calls[0]![0];
    expect(call.html).toContain('/invite/abc123token');
    expect(call.text).toContain('/invite/abc123token');
  });

  it('throws when nodemailer reports the recipient as rejected', async () => {
    sendMail.mockResolvedValue({ rejected: ['budi@example.invalid'], pending: [] });

    await expect(
      sendInvitationEmail({
        to: 'budi@example.invalid',
        householdName: 'Keluarga',
        inviterName: 'Wahid',
        token: 'abc123token',
        expiresAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
