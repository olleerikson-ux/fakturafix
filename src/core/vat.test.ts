import { describe, expect, it } from 'vitest';
import type { InvoiceLine, VatRate } from './types';
import { calculateTotals, lineNet } from './vat';

function line(quantity: number, unitPrice: number, vatRate: VatRate = 25): InvoiceLine {
  return { id: `${quantity}-${unitPrice}-${vatRate}`, description: 'Testtjänst', quantity, unitPrice, vatRate };
}

describe('lineNet', () => {
  it('multiplicerar antal med pris', () => {
    expect(lineNet(line(3, 10000))).toBe(30000);
  });

  it('avrundar decimalantal till närmaste öre', () => {
    expect(lineNet(line(1.5, 3333))).toBe(5000); // 4999,5 -> 5000
    expect(lineNet(line(0.333, 100))).toBe(33);
  });

  it('påverkas inte av flyttalsfel', () => {
    expect(lineNet(line(1.005, 100))).toBe(101);
  });
});

describe('calculateTotals', () => {
  it('ger nollor för en tom faktura', () => {
    expect(calculateTotals([])).toEqual({ net: 0, vatByRate: {}, vat: 0, rounding: 0, total: 0 });
  });

  it('räknar 25 % moms på en enkel faktura', () => {
    expect(calculateTotals([line(2, 50000)])).toEqual({
      net: 100000,
      vatByRate: { 25: 25000 },
      vat: 25000,
      rounding: 0,
      total: 125000,
    });
  });

  it('räknar moms per sats för blandade momssatser och tar bara med förekommande satser', () => {
    const totals = calculateTotals([
      line(1, 10000, 25),
      line(1, 20000, 12),
      line(2, 5000, 6),
      line(1, 7000, 0),
      line(1, 10000, 25),
    ]);
    expect(totals.vatByRate).toEqual({ 25: 5000, 12: 2400, 6: 600, 0: 0 });
    expect(totals.net).toBe(57000);
    expect(totals.vat).toBe(8000);
    expect(totals.total).toBe(65000);
    expect(Object.keys(totals.vatByRate)).not.toContain('NaN');
  });

  it('räknar momsen på summan per sats, inte per rad', () => {
    // Per rad: 0,25 öre avrundas till 0 tre gånger. På summan: 3 öre * 25 % = 0,75 -> 1 öre.
    const totals = calculateTotals([line(1, 1), line(1, 1), line(1, 1)]);
    expect(totals.vatByRate[25]).toBe(1);
  });

  it('öresavrundar uppåt', () => {
    // 100,40 + 25,10 = 125,50 -> 126 kr
    const totals = calculateTotals([line(1, 10040)]);
    expect(totals.vat).toBe(2510);
    expect(totals.rounding).toBe(50);
    expect(totals.total).toBe(12600);
  });

  it('öresavrundar nedåt med negativ avrundning', () => {
    // 100,30 + 25,08 (25,075 -> 25,08) = 125,38 -> 125 kr
    const totals = calculateTotals([line(1, 10030)]);
    expect(totals.vat).toBe(2508);
    expect(totals.rounding).toBe(-38);
    expect(totals.total).toBe(12500);
  });

  it('håller ihop: netto + moms + avrundning = total i hela kronor', () => {
    const totals = calculateTotals([line(1.25, 99999, 25), line(3, 1234, 12), line(7, 333, 6)]);
    expect(totals.net + totals.vat + totals.rounding).toBe(totals.total);
    expect(totals.total % 100).toBe(0);
  });
});
