import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('joins plain class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b');
  });

  it('resolves standard Tailwind conflicts (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('does not let our custom font-size scale collide with the text-color scale', () => {
    // Regression: text-body (font-size token) vs text-text-muted (color
    // token) both start with `text-`; tailwind-merge must keep both.
    expect(cn('text-text-muted', 'text-body')).toBe('text-text-muted text-body');
    expect(cn('text-hero', 'text-text')).toBe('text-hero text-text');
  });

  it('still lets two font-size classes conflict (only one should win)', () => {
    expect(cn('text-hero', 'text-body')).toBe('text-body');
  });

  it('still lets two color classes conflict (only one should win)', () => {
    expect(cn('text-text', 'text-text-muted')).toBe('text-text-muted');
  });
});
