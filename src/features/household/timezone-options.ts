/**
 * Curated timezone choices for the household create/settings form — the
 * three IANA zones that actually correspond to Indonesian time (WIB/WITA/
 * WIT), rather than a exhaustive `Intl.supportedValuesOf('timeZone')` list
 * that would bury the three anyone here actually needs. Validation itself
 * (src/features/household/schema.ts's `timezoneSchema`) accepts any valid
 * IANA name — this is only the picker's option list.
 */
export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Jakarta' },
  { value: 'Asia/Makassar', label: 'WITA — Makassar' },
  { value: 'Asia/Jayapura', label: 'WIT — Jayapura' },
];

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';
