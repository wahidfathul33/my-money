/**
 * Sentry event scrubber — docs/12-security-and-auth.md §10 ("Scrubber
 * membuang field yang cocok dengan pola nominal dan nama field sensitif
 * sebelum exception dikirim ke observability") and
 * docs/13-deployment-vercel.md §9 ("Error runtime | Sentry (dengan
 * scrubbing data finansial)").
 *
 * This is defense in depth, not the only line of defense — the primary rule
 * is still "never pass financial data into a Sentry/log call in the first
 * place" (src/lib/observability/log-route-error.ts's own doc comment, and
 * every call site in this codebase). This module exists so that a mistake
 * at a call site (an amount accidentally landing in `extra`, a stack trace
 * that happens to interpolate a balance into an error message) doesn't
 * silently leave the process anyway.
 *
 * Never logged, per docs/12 §10: nominal, catatan transaksi, saldo dompet,
 * nilai net worth, nama kreditur/debitur, nama bank, kepemilikan aset, nama
 * household, nama anggota.
 */
import type * as Sentry from '@sentry/nextjs';

/**
 * Object keys whose VALUE is dropped wholesale, regardless of type — these
 * names, in this codebase's domain vocabulary (English and Indonesian),
 * only ever hold financial amounts or personally-identifying names.
 */
const SENSITIVE_KEY_PATTERN =
  /amount|balance|saldo|nominal|networth|net_worth|kekayaan|principal|pokok|interest|bunga|price|harga|remaining|sisa|drift|debt|hutang|receivable|piutang|creditor|kreditur|debtor|debitur|bank|householdname|household_name|membername|member_name|payer|penerima|contribut|kontribusi|note\b|catatan|memo|email|phone|telepon|alamat|^address$|ownername|owner_name|pemilik/i;

/** Currency-shaped substrings inside otherwise-kept strings (error messages, stack frames). */
function scrubCurrencyLikeStrings(input: string): string {
  return input
    .replace(/Rp\s?[\d.,]+/gi, 'Rp[REDACTED]')
    .replace(/\b\d{1,3}(?:[.,]\d{3}){2,}\b/g, '[REDACTED]'); // e.g. 10.000.000 / 1,234,567
}

/**
 * `AppError` subclasses (src/lib/api/errors.ts) whose `.message` is built
 * from a household/member/counterparty NAME, not just a number —
 * `scrubCurrencyLikeStrings`'s regexes only catch amount-shaped substrings,
 * so a name-bearing message needs the WHOLE value dropped instead. These
 * messages are meant for the user who already knows the name (docs/12 §5
 * H9's exception, spelled out in each class's own doc comment) — the
 * problem is only if the same string leaves the process toward Sentry via
 * `src/instrumentation.ts`'s `onRequestError`, which captures every
 * uncaught Server Action/Route Handler error, not just ones written with
 * observability in mind.
 *
 * `AppError` sets `.name = new.target.name` (its own constructor), which
 * Sentry serializes as `exception.values[].type` — matching on that is
 * more reliable than pattern-matching the message text, since a name can't
 * be told apart from any other word by regex.
 */
const NAME_BEARING_ERROR_TYPES = new Set(['WalletNotEligibleError', 'OwnerBlockedDeletionError']);

/** Recursively redacts sensitive keys and currency-shaped values in any JSON-like structure. */
export function scrubFinancialData<T>(value: T, keyHint?: string): T {
  if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) {
    return '[Redacted]' as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubFinancialData(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubFinancialData(nested, key);
    }
    return out as T;
  }
  if (typeof value === 'string') {
    return scrubCurrencyLikeStrings(value) as unknown as T;
  }
  return value;
}

/**
 * `beforeSend` / `beforeSendTransaction` hook — wired in
 * src/instrumentation.ts and src/instrumentation-client.ts. Scrubs `extra`,
 * `contexts`, `tags`, breadcrumb data/messages, request body, and
 * exception/message text. Leaves technical fields (event_id, level,
 * timestamp, platform, sdk, stack frame file/line, exception type) alone —
 * those are what make an error report useful to begin with.
 *
 * Generic over `E` (rather than the plain `Sentry.Event` union member) so
 * it type-checks as both a `beforeSend` (expects `ErrorEvent -> ErrorEvent`)
 * and a `beforeSendTransaction` (expects `TransactionEvent ->
 * TransactionEvent`) hook without duplicating this function — the body
 * works against the widened `Sentry.Event` shape internally, since every
 * field it touches is optional on both event kinds.
 */
export function scrubSentryEvent<E extends Sentry.Event>(event: E): E {
  const e = event as Sentry.Event;
  if (e.extra) {
    e.extra = scrubFinancialData(e.extra);
  }
  if (e.contexts) {
    e.contexts = scrubFinancialData(e.contexts);
  }
  if (e.tags) {
    e.tags = scrubFinancialData(e.tags) as typeof e.tags;
  }
  if (e.breadcrumbs) {
    e.breadcrumbs = e.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: crumb.data ? scrubFinancialData(crumb.data) : crumb.data,
      message: crumb.message ? scrubCurrencyLikeStrings(crumb.message) : crumb.message,
    }));
  }
  if (e.request) {
    e.request = {
      ...e.request,
      cookies: undefined,
      data: e.request.data ? scrubFinancialData(e.request.data) : e.request.data,
    };
  }
  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((value) => {
        if (!value.value) return value;
        if (value.type && NAME_BEARING_ERROR_TYPES.has(value.type)) {
          return { ...value, value: `[Redacted: ${value.type}]` };
        }
        return { ...value, value: scrubCurrencyLikeStrings(value.value) };
      }),
    };
  }
  if (e.message) {
    e.message = scrubCurrencyLikeStrings(e.message);
  }
  return event;
}
