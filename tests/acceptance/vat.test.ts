/**
 * Acceptanstester: radbelopp, moms per sats och öresavrundning.
 * Alla förväntade värden är uträknade för hand (se kommentarerna).
 */
import { describe, expect, it } from 'vitest';
import { calculateTotals, lineNet } from '../../src/core';
import { line } from './helpers';

describe('lineNet', () => {
  it('multiplicerar antal med à-pris', () => {
    // 3 st à 33,33 kr = 99,99 kr
    expect(lineNet(line(3, 3333, 25))).toBe(9999);
  });

  it('hanterar antal med decimaler', () => {
    // 2,5 tim à 850,00 kr = 2 125,00 kr
    expect(lineNet(line(2.5, 85000, 25))).toBe(212500);
  });

  it('avrundar till helt öre utan flyttalsrester', () => {
    // 0,333 × 100,00 kr = 33,30 kr (flyttal ger 3330.0000000000005)
    expect(lineNet(line(0.333, 10000, 25))).toBe(3330);
    // 0,1 × 0,07 kr = 0,007 kr -> 0,01 kr
    expect(lineNet(line(0.1, 7, 25))).toBe(1);
    expect(Number.isInteger(lineNet(line(1.1, 333, 12)))).toBe(true);
  });
});

describe('calculateTotals: blandade momssatser', () => {
  // 25 %: 2 × 1 000,00 kr = 2 000,00 kr, moms 500,00 kr
  // 12 %: 3 × 33,33 kr    =    99,99 kr, moms 11,9988 -> 12,00 kr
  //  6 %: 1,5 × 199,90 kr =   299,85 kr, moms 17,991  -> 17,99 kr
  //  0 %: 1 × 500,00 kr   =   500,00 kr, moms 0
  // Netto 2 899,84 + moms 529,99 = 3 429,83 -> att betala 3 430,00, öresavrundning +0,17
  const lines = [line(2, 100000, 25), line(3, 3333, 12), line(1.5, 19990, 6), line(1, 50000, 0)];
  const totals = calculateTotals(lines);

  it('räknar netto', () => {
    expect(totals.net).toBe(289984);
  });

  it('räknar moms per sats', () => {
    expect(totals.vatByRate).toEqual({ 25: 50000, 12: 1200, 6: 1799, 0: 0 });
  });

  it('räknar total moms som summan av satserna', () => {
    expect(totals.vat).toBe(52999);
  });

  it('avrundar totalen till hela kronor och visar avrundningen', () => {
    expect(totals.rounding).toBe(17);
    expect(totals.total).toBe(343000);
  });

  it('är internt konsistent', () => {
    expect(totals.net + totals.vat + totals.rounding).toBe(totals.total);
    expect(totals.total % 100).toBe(0);
  });
});

describe('calculateTotals: momsens beräkningsgrund', () => {
  it('tar bara med satser som förekommer', () => {
    const totals = calculateTotals([line(1, 10000, 25), line(2, 5000, 25)]);
    expect(Object.keys(totals.vatByRate)).toEqual(['25']);
    expect(totals.vatByRate[25]).toBe(5000);
  });

  it('räknar moms på summan per sats, inte per rad', () => {
    // Tre rader à 0,01 kr med 25 %: per sats 0,03 × 25 % = 0,0075 -> 0,01 kr.
    // (Per rad hade det blivit 3 × 0,0025 -> 0.)
    const totals = calculateTotals([line(1, 1, 25), line(1, 1, 25), line(1, 1, 25)]);
    expect(totals.net).toBe(3);
    expect(totals.vat).toBe(1);
  });

  it('ger nollor för en faktura utan rader', () => {
    expect(calculateTotals([])).toEqual({ net: 0, vatByRate: {}, vat: 0, rounding: 0, total: 0 });
  });
});

describe('calculateTotals: öresavrundning', () => {
  it('avrundar nedåt', () => {
    // 100,20 + 25,05 moms = 125,25 -> 125,00, avrundning -0,25
    const totals = calculateTotals([line(1, 10020, 25)]);
    expect(totals.vat).toBe(2505);
    expect(totals.rounding).toBe(-25);
    expect(totals.total).toBe(12500);
  });

  it('avrundar uppåt', () => {
    // 100,60 + 25,15 moms = 125,75 -> 126,00, avrundning +0,25
    const totals = calculateTotals([line(1, 10060, 25)]);
    expect(totals.vat).toBe(2515);
    expect(totals.rounding).toBe(25);
    expect(totals.total).toBe(12600);
  });

  it('avrundar inte jämna kronor', () => {
    // 800,00 + 200,00 moms = 1 000,00
    const totals = calculateTotals([line(1, 80000, 25)]);
    expect(totals.rounding).toBe(0);
    expect(totals.total).toBe(100000);
  });

  it('kan avrunda ner till noll', () => {
    // 0,03 + 0,01 moms = 0,04 -> 0,00, avrundning -0,04
    const totals = calculateTotals([line(3, 1, 25)]);
    expect(totals.rounding).toBe(-4);
    expect(totals.total).toBe(0);
  });
});
