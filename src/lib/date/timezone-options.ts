/**
 * Curated timezone choices for any zone picker in the app — the three IANA
 * zones that actually correspond to Indonesian time (WIB/WITA/WIT), rather
 * than an exhaustive `Intl.supportedValuesOf('timeZone')` list that would
 * bury the three anyone here actually needs. Validation itself
 * (`isValidTimeZone`, src/lib/date/timezone.ts) accepts any valid IANA
 * name — this is only the picker's option list.
 *
 * Originally lived at src/features/household/timezone-options.ts (task 10);
 * relocated here so tasks/22-settings-sharing-pwa's `/settings/preferences`
 * picker can share the exact same list without a features/A-importing-
 * features/B violation (docs/11-tech-architecture.md §3). That module now
 * re-exports from here for backward compatibility.
 */
export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Jakarta' },
  { value: 'Asia/Makassar', label: 'WITA — Makassar' },
  { value: 'Asia/Jayapura', label: 'WIT — Jayapura' },
];
