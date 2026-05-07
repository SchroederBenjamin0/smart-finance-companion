import { describe, it, expect } from 'vitest';
import { parseEurInput } from '@/lib/currency';

describe('parseEurInput', () => {
  it.each([
    ['', null],
    ['12', 12],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['  12,5  ', 12.5],
    ['0', 0],
    ['0,01', 0.01],
    ['0.01', 0.01],
    ['abc', null],
    ['12.34.56', null],
    ['12,34,56', null],
    ['1 234,56', 1234.56],
  ])('parses %j → %j', (input, expected) => {
    expect(parseEurInput(input as string)).toBe(expected);
  });
});
