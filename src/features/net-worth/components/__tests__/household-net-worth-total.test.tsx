/**
 * Proves `coverage` is a TYPE-LEVEL requirement on `HouseholdNetWorthTotal`
 * (and, by the same mechanism, on `CoverageNote`), not just a convention —
 * tasks/19-net-worth/spec.md: "merender angkanya tanpa cakupan menghasilkan
 * error TypeScript — bukan sekadar pelanggaran konvensi yang bisa lolos
 * review."
 *
 * vitest itself doesn't type-check (esbuild strips types without
 * verifying them), so the SECOND case below only actually proves anything
 * under `npm run typecheck` (`tsc --noEmit`, which this repo's tsconfig
 * runs over every `**\/*.tsx` file, tests included — see
 * src/lib/services/__tests__/savings.integration.test.ts for the same
 * `@ts-expect-error`-as-proof technique already established here): if
 * `coverage` is ever made optional, the intentional error stops occurring
 * and the now-UNUSED `@ts-expect-error` directive itself becomes a tsc
 * error, failing the build. Both cases still execute fine at runtime
 * either way, since `@ts-expect-error` doesn't change emitted JS.
 */
import { describe, expect, it } from 'vitest';
import { HouseholdNetWorthTotal } from '../household-net-worth-total';
import { CoverageNote } from '@/components/finance/coverage-note';

describe('HouseholdNetWorthTotal / CoverageNote — coverage is a required prop', () => {
  it('compiles fine when coverage IS supplied', () => {
    const el = <HouseholdNetWorthTotal netWorth={245_000_000_00n} coverage={{ memberCount: 3, contributingCount: 2 }} />;
    expect(el).toBeTruthy();

    const note = <CoverageNote coverage={{ memberCount: 3, contributingCount: 2 }} />;
    expect(note).toBeTruthy();
  });

  it('omitting coverage must be a TypeScript error, proven by @ts-expect-error', () => {
    // @ts-expect-error — `coverage` is required on HouseholdNetWorthTotal; omitting it must not compile.
    const el = <HouseholdNetWorthTotal netWorth={245_000_000_00n} />;
    expect(el).toBeTruthy();

    // @ts-expect-error — same requirement on CoverageNote directly.
    const note = <CoverageNote />;
    expect(note).toBeTruthy();
  });
});
