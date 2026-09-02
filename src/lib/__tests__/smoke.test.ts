import { describe, expect, it } from 'vitest';

/**
 * Smoke test — proves the Vitest pipeline (config, path alias, coverage)
 * is wired correctly. Replace/extend once real `lib/` modules land.
 */
describe('project bootstrap', () => {
  it('runs Vitest with basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });
});
