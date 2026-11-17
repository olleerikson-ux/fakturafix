/**
 * Acceptanstester för issue #58: påminnelsebelopp (reminderAmounts) och bokföringsexport (invoicesToCsv).
 * Alla belopp är uträknade för hand utifrån spec i issuen, inte ur implementationen.
 */
import { describe, expect, it } from 'vitest';
import { invoicesToCsv, reminderAmounts, type Invoice } from '../../src/core';
import { customer, invoice, line, settings } from './helpers';

const BOM = '﻿';
const HEADER =
  'Fakturanummer;Fakturadatum;Förfallodatum;Kund;Kundens org.nr;Momssats;Netto;Moms;Totalt;Status;Betaldatum;Avser faktura';

/** Standardfakturan: 1 000,00 kr + 25 % moms = 1 250,00 kr (125 000 öre), förfaller 2026-03-31. */
const due = (overrides: Partial<Invoice> = {}) => invoice(overrides);
const withInterest = (percent: number | undefined) =>
  settings(percent === undefined ? { lateInterestPercent: undefined } : { lateInterestPercent: percent });

describe('reminderAmounts: dröjsmålsränta (uträknad för hand)', () => {
  it('10 dagar försenad vid 8 %: 125 000 × 0,08 × 10 / 365 = 2 739,7 → 2 740 öre', () => {
    const r = reminderAmounts(due(), withInterest(8), '2026-04-10');
    expect(r.principal).toBe(125000);
    expect(r.daysLate).toBe(10);
    expect(r.interest).toBe(2740);
    expect(r.fee).toBe(0);
    expect(r.total).toBe(127740);
  });

  it('dagräkningen börjar dagen efter förfallodatum och inkluderar today', () => {
    expect(reminderAmounts(due(), withInterest(8), '2026-04-01').daysLate).toBe(1);
    expect(reminderAmounts(due(), withInterest(8), '2026-03-31').daysLate).toBe(0);
    expect(reminderAmounts(due(), withInterest(8), '2026-03-15').daysLate).toBe(0);
  });

  it('ingen ränta och total = principal när fakturan inte har förfallit', () => {
    const r = reminderAmounts(due(), withInterest(8), '2026-03-31');
    expect(r.daysLate).toBe(0);
    expect(r.interest).toBe(0);
    expect(r.total).toBe(125000);
  });

  it('365 dagar vid 8 % ger exakt 8 % av kapitalet: 10 000 öre', () => {
    const r = reminderAmounts(due(), withInterest(8), '2027-03-31');
    expect(r.daysLate).toBe(365);
    expect(r.interest).toBe(10000);
  });

  it('ränta saknas i inställningarna: räntan blir 0', () => {
    const r = reminderAmounts(due(), withInterest(undefined), '2026-04-10');
    expect(r.daysLate).toBe(10);
    expect(r.interest).toBe(0);
    expect(r.total).toBe(125000);
  });

  it('halva ören avrundas bort från noll: 5 000 öre × 3,65 % × d / 365 = 0,5 d öre', () => {
    const fiftyKr = due({ lines: [line(1, 5000, 0)] });
    const s = withInterest(3.65);
    expect(reminderAmounts(fiftyKr, s, '2026-04-01').interest).toBe(1); // 0,5 → 1
    expect(reminderAmounts(fiftyKr, s, '2026-04-02').interest).toBe(1); // 1,0
    expect(reminderAmounts(fiftyKr, s, '2026-04-03').interest).toBe(2); // 1,5 → 2
  });

  it('principal är fakturans "att betala" inklusive öresavrundning', () => {
    // 1 000,50 kr utan moms rundas till 1 001 kr = 100 100 öre
    const r = reminderAmounts(due({ lines: [line(1, 100050, 0)] }), withInterest(8), '2026-04-10');
    expect(r.principal).toBe(100100);
  });
});

describe('reminderAmounts: påminnelseavgift', () => {
  it('använder reminderFee från inställningarna', () => {
    const r = reminderAmounts(due(), settings({ lateInterestPercent: 8, reminderFee: 6000 }), '2026-04-10');
    expect(r.fee).toBe(6000);
    expect(r.total).toBe(125000 + 2740 + 6000);
  });

  it('lägre avgift än taket följer inställningen', () => {
    const r = reminderAmounts(due(), settings({ lateInterestPercent: 8, reminderFee: 4500 }), '2026-04-10');
    expect(r.fee).toBe(4500);
  });

  it('avgiften blir 0 när den inte är angiven', () => {
    expect(reminderAmounts(due(), withInterest(8), '2026-04-10').fee).toBe(0);
  });

  it('avgiften kapas till 60 kr (6 000 öre) och kastar inget fel', () => {
    const over = reminderAmounts(due(), settings({ lateInterestPercent: 8, reminderFee: 6001 }), '2026-04-10');
    expect(over.fee).toBe(6000);
    expect(over.total).toBe(125000 + 2740 + 6000);
    expect(reminderAmounts(due(), settings({ lateInterestPercent: 8, reminderFee: 100000 }), '2026-04-10').fee).toBe(6000);
  });
});

describe('reminderAmounts: ogiltiga fakturor', () => {
  it('kastar fel för utkast', () => {
    expect(() => reminderAmounts(due({ number: 0, status: 'draft' }), withInterest(8), '2026-04-10')).toThrow();
  });

  it('kastar fel för betalda fakturor', () => {
    expect(() =>
      reminderAmounts(due({ status: 'paid', paidDate: '2026-03-20' }), withInterest(8), '2026-04-10'),
    ).toThrow();
  });

  it('kastar fel för kreditfakturor', () => {
    const credit = due({ id: 'kredit', number: 1002, creditFor: 'faktura-1', lines: [line(-1, 100000, 25)] });
    expect(() => reminderAmounts(credit, withInterest(8), '2026-04-10')).toThrow();
  });
});

function rows(csv: string): string[] {
  return csv.replace(BOM, '').split('\r\n').filter((r) => r !== '');
}

describe('invoicesToCsv: format', () => {
  const csv = invoicesToCsv([due()], [customer()]);

  it('börjar med BOM och rubrikraden med semikolon', () => {
    expect(csv.startsWith(BOM)).toBe(true);
    expect(rows(csv)[0]).toBe(HEADER);
  });

  it('använder CRLF och inga lösa radbrytningar', () => {
    expect(csv).toContain('\r\n');
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('en rad per faktura och momssats med decimalkomma och kronor', () => {
    expect(rows(csv)).toHaveLength(2);
    expect(rows(csv)[1]!.startsWith('1001;2026-03-01;2026-03-31;Testkund AB;556000-0000;25;1000,00;250,00;1250,00;')).toBe(true);
  });

  it('Momssats, Netto och Moms står i rätt kolumn', () => {
    const cols = rows(csv)[1]!.split(';');
    expect(cols).toHaveLength(12);
    expect(cols[5]).toBe('25');
    expect(cols[6]).toBe('1000,00');
    expect(cols[7]).toBe('250,00');
    expect(cols[8]).toBe('1250,00');
    expect(cols[10]).toBe('');
    expect(cols[11]).toBe('');
  });

  it('inga tusentalsavgränsare i beloppen', () => {
    const big = invoicesToCsv([due({ lines: [line(1, 1234567, 0)] })], [customer()]);
    const cols = rows(big)[1]!.split(';');
    expect(cols[6]).toBe('12345,67');
    expect(cols[7]).toBe('0,00');
  });

  it('små belopp får två decimaler: 5 öre blir 0,05', () => {
    const small = invoicesToCsv([due({ lines: [line(1, 5, 0)] })], [customer()]);
    expect(rows(small)[1]!.split(';')[6]).toBe('0,05');
  });
});

describe('invoicesToCsv: flera momssatser och citering', () => {
  it('ger en rad per momssats för samma faktura', () => {
    const mixed = due({ lines: [line(1, 100000, 25), line(1, 50000, 12)] });
    const out = rows(invoicesToCsv([mixed], [customer()])).slice(1);
    expect(out).toHaveLength(2);
    const byRate = Object.fromEntries(out.map((r) => [r.split(';')[5], r.split(';')]));
    expect(byRate['25']?.[6]).toBe('1000,00');
    expect(byRate['25']?.[7]).toBe('250,00');
    expect(byRate['12']?.[6]).toBe('500,00');
    expect(byRate['12']?.[7]).toBe('60,00');
  });

  it('Totalt per rad är netto + moms för den satsen, och ingen avrundningsrad när avrundningen är 0', () => {
    const mixed = due({ lines: [line(1, 100000, 25), line(1, 50000, 12)] });
    const out = rows(invoicesToCsv([mixed], [customer()])).slice(1).map((r) => r.split(';'));
    expect(out).toHaveLength(2);
    expect(out.find((c) => c[5] === '25')?.[8]).toBe('1250,00');
    expect(out.find((c) => c[5] === '12')?.[8]).toBe('560,00');
  });

  it('en extra rad "Öresavrundning" med Netto 0, Moms 0 och Totalt = avrundningen, så att summan blir "att betala"', () => {
    // 1 000,50 kr utan moms rundas upp till 1 001 kr: avrundning +0,50 kr
    const up = due({ lines: [line(1, 100050, 0)] });
    const out = rows(invoicesToCsv([up], [customer()])).slice(1).map((c) => c.split(';'));
    expect(out).toHaveLength(2);
    const rate = out.find((c) => c[5] === '0');
    const rounding = out.find((c) => c[5] === 'Öresavrundning');
    expect(rate?.[6]).toBe('1000,50');
    expect(rate?.[8]).toBe('1000,50');
    expect(rounding?.[0]).toBe('1001');
    expect(rounding?.[6]).toBe('0,00');
    expect(rounding?.[7]).toBe('0,00');
    expect(rounding?.[8]).toBe('0,50');
  });

  it('negativ avrundning ger negativt Totalt på avrundningsraden', () => {
    // 1 000,49 kr utan moms rundas ner till 1 000 kr: avrundning -0,49 kr
    const down = due({ lines: [line(1, 100049, 0)] });
    const out = rows(invoicesToCsv([down], [customer()])).slice(1).map((c) => c.split(';'));
    expect(out.find((c) => c[5] === 'Öresavrundning')?.[8]).toBe('-0,49');
  });

  it('citerar fält med semikolon och dubblar citattecken', () => {
    const tricky = customer({ name: 'Svensson; Söner "AB"' });
    const out = rows(invoicesToCsv([due()], [tricky]))[1]!;
    expect(out).toContain('"Svensson; Söner ""AB"""');
  });
});

describe('invoicesToCsv: urval', () => {
  const jan = due({ id: 'a', number: 1001, issueDate: '2026-01-15', dueDate: '2026-02-14' });
  const feb = due({ id: 'b', number: 1002, issueDate: '2026-02-15', dueDate: '2026-03-17' });
  const mar = due({ id: 'c', number: 1003, issueDate: '2026-03-15', dueDate: '2026-04-14' });
  const draft = due({ id: 'd', number: 0, status: 'draft', issueDate: '2026-02-20' });
  const numbers = (csv: string) => rows(csv).slice(1).map((r) => r.split(';')[0]);

  it('tar bara med utfärdade fakturor, aldrig utkast', () => {
    expect(numbers(invoicesToCsv([jan, draft, feb], [customer()]))).toEqual(['1001', '1002']);
  });

  it('filtrerar på fakturadatum, inklusive gränsdagarna', () => {
    const all = [jan, feb, mar];
    expect(numbers(invoicesToCsv(all, [customer()], '2026-02-01', '2026-02-28'))).toEqual(['1002']);
    expect(numbers(invoicesToCsv(all, [customer()], '2026-02-15', '2026-02-15'))).toEqual(['1002']);
    expect(numbers(invoicesToCsv(all, [customer()], '2026-02-15'))).toEqual(['1002', '1003']);
    expect(numbers(invoicesToCsv(all, [customer()], undefined, '2026-02-15'))).toEqual(['1001', '1002']);
  });

  it('tom lista ger bara rubrikraden', () => {
    expect(rows(invoicesToCsv([], []))).toEqual([HEADER]);
  });

  it('en betald faktura har Betaldatum', () => {
    const paid = due({ status: 'paid', paidDate: '2026-03-20' });
    expect(rows(invoicesToCsv([paid], [customer()]))[1]!.split(';')[10]).toBe('2026-03-20');
  });
});

describe('invoicesToCsv: kreditfaktura', () => {
  it('har negativa belopp och anger krediterad faktura i "Avser faktura"', () => {
    const original = due();
    const credit = due({ id: 'kredit', number: 1002, creditFor: original.id, lines: [line(-1, 100000, 25)] });
    const out = rows(invoicesToCsv([original, credit], [customer()])).slice(1).map((r) => r.split(';'));
    const creditRow = out.find((c) => c[0] === '1002');
    expect(creditRow?.[6]).toBe('-1000,00');
    expect(creditRow?.[7]).toBe('-250,00');
    expect(creditRow?.[8]).toBe('-1250,00');
    expect(creditRow?.[11]).toBe('1001');
    const originalRow = out.find((c) => c[0] === '1001');
    expect(originalRow?.[11]).toBe('');
  });
});
