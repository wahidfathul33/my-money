import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../cursor';

describe('cursor', () => {
  it('round-trips date + id', () => {
    const cursor = { transactionDate: '2026-09-02T05:30:00.000Z', id: '018f1e2a-1234-7abc-8def-0123456789ab' };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it('produces a URL-safe string (no +, /, or = padding)', () => {
    const encoded = encodeCursor({
      transactionDate: '2026-09-02T05:30:00.000Z',
      id: '018f1e2a-1234-7abc-8def-0123456789ab',
    });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('rejects garbage input safely (returns null, never throws)', () => {
    expect(decodeCursor('not-valid-base64-!!!')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(Buffer.from('no-separator-here', 'utf-8').toString('base64url'))).toBeNull();
  });

  it('rejects a cursor with a malformed date', () => {
    const bad = Buffer.from('not-a-date|018f1e2a-1234-7abc-8def-0123456789ab', 'utf-8').toString(
      'base64url',
    );
    expect(decodeCursor(bad)).toBeNull();
  });

  it('rejects a cursor whose id is not a UUID', () => {
    const bad = Buffer.from('2026-09-02T05:30:00.000Z|not-a-uuid', 'utf-8').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });

  it('rejects a cursor missing the id half entirely', () => {
    const bad = Buffer.from('2026-09-02T05:30:00.000Z|', 'utf-8').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });
});
