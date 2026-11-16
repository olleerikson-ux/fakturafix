/**
 * Acceptanstester: OCR-nummer med längdsiffra och Luhn-kontrollsiffra.
 * Förväntade värden är uträknade för hand enligt AGENTS.md.
 */
import { describe, expect, it } from 'vitest';
import { createOcr, isValidOcr } from '../../src/core';

describe('createOcr', () => {
  it('ger exemplet från specifikationen', () => {
    // 1001 + längd 6 -> "10016", Luhn: 6·2=12->3, 1, 0·2=0, 0, 1·2=2 => 6 -> kontrollsiffra 4
    expect(createOcr(1001)).toBe('100164');
  });

  it('ger rätt nummer för andra längder', () => {
    expect(createOcr(1)).toBe('133');
    expect(createOcr(12345)).toBe('1234574');
  });

  it('använder längden modulo 10 som längdsiffra', () => {
    // 8 siffror + 2 kontrollsiffror = 10 -> längdsiffra 0
    expect(createOcr(12345678)).toBe('1234567806');
    expect(createOcr(99999999)).toBe('9999999908');
  });

  it('ger bara siffror och fakturanumret först', () => {
    for (const n of [1001, 1002, 1099, 2000, 123456]) {
      const ocr = createOcr(n);
      expect(ocr).toMatch(/^\d+$/);
      expect(ocr.startsWith(String(n))).toBe(true);
      expect(ocr).toHaveLength(String(n).length + 2);
    }
  });

  it('ger nummer som isValidOcr godtar', () => {
    for (let n = 1001; n <= 1100; n++) {
      expect(isValidOcr(createOcr(n))).toBe(true);
    }
  });
});

describe('isValidOcr', () => {
  it('godtar korrekta nummer', () => {
    expect(isValidOcr('100164')).toBe(true);
    expect(isValidOcr('1234574')).toBe(true);
    expect(isValidOcr('1234567806')).toBe(true);
  });

  it('avvisar fel kontrollsiffra', () => {
    expect(isValidOcr('100165')).toBe(false);
    expect(isValidOcr('100160')).toBe(false);
    expect(isValidOcr('1234575')).toBe(false);
  });

  it('avvisar fel längdsiffra även när Luhn stämmer', () => {
    // "100172" har giltig Luhn-siffra men längdsiffran 7 stämmer inte med längden 6
    expect(isValidOcr('100172')).toBe(false);
  });

  it('avvisar en ändrad siffra i fakturanumret', () => {
    expect(isValidOcr('200164')).toBe(false);
  });

  it('avvisar tomma, för korta och icke-numeriska värden', () => {
    expect(isValidOcr('')).toBe(false);
    expect(isValidOcr('4')).toBe(false);
    expect(isValidOcr('abcdef')).toBe(false);
    expect(isValidOcr('1001-64')).toBe(false);
  });
});
