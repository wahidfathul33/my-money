import { describe, expect, it } from 'vitest';
import { greetingForHour } from '../greeting';

describe('greetingForHour', () => {
  it.each([
    [0, 'Selamat pagi'],
    [10, 'Selamat pagi'],
    [11, 'Selamat siang'],
    [14, 'Selamat siang'],
    [15, 'Selamat sore'],
    [17, 'Selamat sore'],
    [18, 'Selamat malam'],
    [23, 'Selamat malam'],
  ])('hour %i -> %s', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});
