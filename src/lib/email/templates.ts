/**
 * Shared email-rendering helpers — factored out of the layout
 * src/lib/email/magic-link.ts (task 04) established, so
 * src/lib/email/invitation.ts doesn't re-implement HTML escaping or the
 * card/button chrome from scratch. Deliberately tiny: this app sends two
 * kinds of email total (magic link, household invitation), not enough to
 * justify a templating engine.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EmailLayoutInput {
  /** Plain text, escaped by this function — never pass pre-escaped HTML. */
  heading: string;
  /** Each string becomes its own paragraph, escaped by this function. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print below the button — disclaimers, expiry notices. */
  footnote?: string;
}

/**
 * Same visual shell as `htmlBody` in src/lib/email/magic-link.ts (rounded
 * card, centered, system font stack) so the two emails this app sends read
 * as one product rather than two different senders.
 */
export function emailLayout({ heading, paragraphs, cta, footnote }: EmailLayoutInput): string {
  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="font-size: 14px; color: #52525b; margin: 0 0 16px;">${escapeHtml(p)}</p>`,
    )
    .join('');

  const ctaHtml = cta
    ? `<a href="${cta.url}"
         style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 0 24px;">
        ${escapeHtml(cta.label)}
      </a>`
    : '';

  const footnoteHtml = footnote
    ? `<p style="font-size: 12px; color: #a1a1aa; margin: 24px 0 0;">${escapeHtml(footnote)}</p>`
    : '';

  return `
<body style="background: #f4f4f5; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="padding: 32px; text-align: center;">
        <h1 style="font-size: 18px; color: #18181b; margin: 0 0 16px;">${escapeHtml(heading)}</h1>
        ${paragraphsHtml}
        ${ctaHtml}
        ${footnoteHtml}
      </td>
    </tr>
  </table>
</body>`;
}
