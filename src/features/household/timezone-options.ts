/**
 * Re-exported from src/lib/date/timezone-options.ts (relocated there by
 * tasks/22-settings-sharing-pwa so `/settings/preferences` can share the
 * same curated list without a features/A-importing-features/B violation).
 * Kept as a re-export, not deleted, so every existing import of this path
 * (e.g. src/features/household/components/create-household-form.tsx)
 * keeps working unchanged.
 */
export { TIMEZONE_OPTIONS } from '@/lib/date/timezone-options';
export { DEFAULT_TIMEZONE } from '@/lib/date/timezone';
