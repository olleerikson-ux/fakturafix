/**
 * Acceptanstester: formatSek och parseSek.
 * Tusentalsavgränsaren får vara vanligt eller hårt mellanslag (issue #3),
 * så vi normaliserar mellanslag innan vi jämför.
 */
import { describe, expect, it } from 'vitest';
import { formatSek, parseSek } from '../../src/core';

/** Ersätter hårt mellanslag (U+00A0), smalt hårt mellanslag (U+202F) och U+2212 minus. */
const normalize = (s: string): string => s.replace(/[  ]/g, ' ').replace(/−/g, '-');

describe('formatSek', () => {
  it('ger exemplet från specifikationen', () => {
    expect(normalize(formatSek(123450))).toBe('1 234,50 kr');
  });

  it('visar alltid två decimaler', () => {
    expect(normalize(formatSek(0))).toBe('0,00 kr');
    expect(normalize(formatSek(5))).toBe('0,05 kr');
    expect(normalize(formatSek(100))).toBe('1,00 kr');
    expect(normalize(formatSek(99990))).toBe('999,90 kr');
  });

  it('grupperar tusental med mellanslag', () => {
    expect(normalize(formatSek(100000))).toBe('1 000,00 kr');
    expect(normalize(formatSek(123456789))).toBe('1 234 567,89 kr');
  });

  it('visar negativa belopp (t.ex. öresavrundning) med minustecken', () => {
    expect(normalize(formatSek(-25))).toBe('-0,25 kr');
    expect(normalize(formatSek(-123450))).toBe('-1 234,50 kr');
  });

  it('är konsekvent med mellanslagstyp', () => {
    const out = formatSek(123456789);
    const spaces = new Set(out.match(/[   ]/g));
    expect(spaces.size).toBe(1);
  });
});

describe('parseSek', () => {
  it('tolkar format från specifikationen', () => {
    expect(parseSek('1234')).toBe(123400);
    expect(parseSek('1 234,50')).toBe(123450);
    expect(parseSek('1234.5')).toBe(123450);
    expect(parseSek('1234,5 kr')).toBe(123450);
  });

  it('tolkar fler vanliga svenska format', () => {
    expect(parseSek('0,05')).toBe(5);
    expect(parseSek('  12 ')).toBe(1200);
    expect(parseSek('1 234,50')).toBe(123450);
    expect(parseSek('1 234 567,89 kr')).toBe(123456789);
    expect(parseSek('500 kr')).toBe(50000);
  });

  it('räknar exakt i öre utan flyttalsfel', () => {
    expect(parseSek('1234,99')).toBe(123499);
    expect(parseSek('0,1')).toBe(10);
    expect(parseSek('19,99')).toBe(1999);
    expect(parseSek('4,35')).toBe(435);
  });

  it('ger null för ogiltig inmatning', () => {
    expect(parseSek('')).toBeNull();
    expect(parseSek('   ')).toBeNull();
    expect(parseSek('abc')).toBeNull();
    expect(parseSek('12abc')).toBeNull();
    expect(parseSek('12,3,4')).toBeNull();
    expect(parseSek('kr')).toBeNull();
  });

  it('går tillbaka till samma belopp från formatSek', () => {
    for (const ore of [0, 5, 100, 123450, 99999999]) {
      expect(parseSek(formatSek(ore))).toBe(ore);
    }
  });
});
