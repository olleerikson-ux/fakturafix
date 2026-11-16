import { describe, expect, it } from 'vitest';
import { createOcr, isValidOcr } from './ocr';

describe('createOcr', () => {
  it('ger exemplet från AGENTS.md', () => {
    expect(createOcr(1001)).toBe('100164');
  });

  it('lägger till längdsiffra modulo 10 för långa nummer', () => {
    const ocr = createOcr(12345678);
    expect(ocr).toHaveLength(10);
    expect(ocr.slice(0, 8)).toBe('12345678');
    expect(ocr[8]).toBe('0');
  });

  it('ger giltiga OCR-nummer för en serie fakturanummer', () => {
    for (let n = 1001; n < 1200; n++) {
      expect(isValidOcr(createOcr(n))).toBe(true);
    }
  });

  it('kastar fel för ogiltiga fakturanummer', () => {
    expect(() => createOcr(-1)).toThrow();
    expect(() => createOcr(10.5)).toThrow();
  });
});

describe('isValidOcr', () => {
  it('godkänner ett korrekt OCR-nummer', () => {
    expect(isValidOcr('100164')).toBe(true);
  });

  it('underkänner fel kontrollsiffra', () => {
    expect(isValidOcr('100165')).toBe(false);
  });

  it('underkänner fel längdsiffra även när Luhn stämmer', () => {
    // "100154": längdsiffran 5 stämmer inte med längden 6.
    expect(isValidOcr('100154')).toBe(false);
  });

  it('underkänner sådant som inte är siffror', () => {
    expect(isValidOcr('')).toBe(false);
    expect(isValidOcr('10016a')).toBe(false);
    expect(isValidOcr('1001 64')).toBe(false);
  });
});
