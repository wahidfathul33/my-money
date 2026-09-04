/**
 * Unit tests for src/features/sharing/last-household-choice.ts — pure
 * localStorage wrapper.
 *
 * Stubs `window.localStorage` with a plain in-memory `Map`-backed
 * implementation rather than relying on jsdom's own (vitest.config.ts's
 * default `environment: 'jsdom'`): on this toolchain (Node 26 + jsdom 30),
 * `window.localStorage` resolves to Node's own experimental, unconfigured
 * `node:internal/webstorage` global instead of jsdom's per-window
 * implementation, which throws "Cannot read properties of undefined"
 * before ever reaching this module's own `try/catch` — an environment
 * quirk unrelated to the module under test, confirmed by the fact that
 * `getLastHouseholdChoice`/`setLastHouseholdChoice` DO have their own
 * `try/catch` around exactly this failure mode (storage unavailable), which
 * silently swallowed it and made every assertion here read back `null`
 * regardless of what was "set". Stubbing keeps this test about the
 * module's key-construction/branching logic, not this toolchain's Web
 * Storage wiring.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLastHouseholdChoice, setLastHouseholdChoice } from '../last-household-choice';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('last-household-choice', () => {
  let originalDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
  });

  it('returns null when nothing has been recorded for a category', () => {
    expect(getLastHouseholdChoice('cat-1')).toBeNull();
  });

  it('remembers the last household chosen for a category', () => {
    setLastHouseholdChoice('cat-1', 'household-a');
    expect(getLastHouseholdChoice('cat-1')).toBe('household-a');
  });

  it('is independent per category', () => {
    setLastHouseholdChoice('cat-1', 'household-a');
    setLastHouseholdChoice('cat-2', 'household-b');
    expect(getLastHouseholdChoice('cat-1')).toBe('household-a');
    expect(getLastHouseholdChoice('cat-2')).toBe('household-b');
  });

  it('overwrites a previous choice for the same category', () => {
    setLastHouseholdChoice('cat-1', 'household-a');
    setLastHouseholdChoice('cat-1', 'household-b');
    expect(getLastHouseholdChoice('cat-1')).toBe('household-b');
  });

  it('forgets the choice when set to null (turning the toggle off)', () => {
    setLastHouseholdChoice('cat-1', 'household-a');
    setLastHouseholdChoice('cat-1', null);
    expect(getLastHouseholdChoice('cat-1')).toBeNull();
  });

  it('getLastHouseholdChoice does not throw and returns null when localStorage access throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage disabled (private browsing)');
      },
    });

    expect(() => getLastHouseholdChoice('cat-1')).not.toThrow();
    expect(getLastHouseholdChoice('cat-1')).toBeNull();
  });

  it('setLastHouseholdChoice does not throw when localStorage access throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage disabled (private browsing)');
      },
    });

    expect(() => setLastHouseholdChoice('cat-1', 'household-a')).not.toThrow();
  });
});
