import { describe, expect, it } from 'vitest';
import { formatSek, parseSek } from './money';

describe('formatSek', () => {
  it('formaterar med mellanslag som tusentalsavgränsare och komma som decimaltecken', () => {
    expect(formatSek(123450)).toBe('1 234,50 kr');
  });

  it('hanterar noll, små belopp och miljoner', () => {
    expect(formatSek(0)).toBe('0,00 kr');
    expect(formatSek(5)).toBe('0,05 kr');
    expect(formatSek(123456789)).toBe('1 234 567,89 kr');
  });

  it('visar negativa belopp med minustecken', () => {
    expect(formatSek(-123450)).toBe('-1 234,50 kr');
    expect(formatSek(-50)).toBe('-0,50 kr');
  });
});

describe('parseSek', () => {
  it.each([
    ['1234', 123400],
    ['1 234,50', 123450],
    ['1234.5', 123450],
    ['1234,5 kr', 123450],
    ['  1 234,05 KR ', 123405],
    ['0,99', 99],
    ['-10,5', -1050],
  ])('tolkar %j som %i öre', (input, expected) => {
    expect(parseSek(input)).toBe(expected);
  });

  it.each(['', 'kr', 'abc', '12,345', '1.234,50', '1,2,3', '12a', '--1', ',50'])(
    'ger null för ogiltig inmatning %j',
    (input) => {
      expect(parseSek(input)).toBeNull();
    },
  );

  it('är inversen av formatSek', () => {
    for (const ore of [0, 1, 99, 100, 123450, 987654321, -4200]) {
      expect(parseSek(formatSek(ore))).toBe(ore);
    }
  });
});
