import { describe, expect, it } from 'vitest';
import { createOcr, type CompanySettings, type Customer, type Invoice } from '../core/index';
import { renderInvoice } from './invoice';

const settings: CompanySettings = {
  name: 'Testfirman HB',
  orgNumber: '556000-0000',
  vatNumber: 'SE556000000001',
  address: { street: 'Testvägen 1', postalCode: '123 45', city: 'Teststad' },
  email: 'info@testfirman.example',
  phone: '070-000 00 00',
  bankgiro: '123-4567',
  fSkatt: true,
  paymentTermsDays: 30,
  lateInterestPercent: 8,
};

const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  orgNumber: '556111-1111',
  vatNumber: 'SE556111111101',
  reference: 'Test Testsson',
  address: { street: 'Kundgatan 2', postalCode: '543 21', city: 'Kundby' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const invoice: Invoice = {
  id: 'i1',
  number: 1001,
  customerId: 'k1',
  issueDate: '2026-02-01',
  dueDate: '2026-03-03',
  ocr: createOcr(1001),
  status: 'sent',
  notes: 'Tack för ditt förtroende',
  createdAt: '2026-02-01T00:00:00.000Z',
  lines: [
    { id: 'a', description: 'Konsulttjänst', quantity: 2.5, unit: 'tim', unitPrice: 100000, vatRate: 25 },
    { id: 'b', description: 'Bok', quantity: 1, unit: 'st', unitPrice: 20050, vatRate: 6 },
  ],
};

const text = (s: CompanySettings = settings, i: Invoice = invoice) => renderInvoice(i, customer, s).textContent ?? '';

describe('renderInvoice', () => {
  it('innehåller obligatoriska uppgifter', () => {
    const t = text();
    for (const part of ['Testfirman HB', 'FAKTURA', '1001', '2026-02-01', '2026-03-03', '100164', 'Test Testsson', 'Testkund AB', 'Kundgatan 2', '543 21 Kundby', '556111-1111', 'SE556111111101', 'Konsulttjänst', 'Tack för ditt förtroende', '123-4567', 'SE556000000001', 'info@testfirman.example', '070-000 00 00', 'Dröjsmålsränta: 8 %']) {
      expect(t).toContain(part);
    }
  });

  it('visar och döljer F-skatt', () => {
    expect(text()).toContain('Godkänd för F-skatt');
    expect(text({ ...settings, fSkatt: false })).not.toContain('F-skatt');
  });

  it('ger varje momssats en egen rad och rätt belopp', () => {
    const t = text();
    expect(t).toContain('Moms 25 %');
    expect(t).toContain('Moms 6 %');
    expect(t).toContain('Summa exkl. moms');
    expect(t).toContain('Att betala');
    expect(t).toContain('Öresavrundning');
    expect(t).toContain('3 338,00 kr');
  });

  it('utelämnar OCR för utkast', () => {
    expect(text(settings, { ...invoice, number: 0, ocr: '', status: 'draft' })).not.toContain('OCR-nummer');
  });

  it('renderar en kreditfaktura med egen rubrik, hänvisning och Att få tillbaka', () => {
    const credit: Invoice = {
      ...invoice,
      id: 'c1',
      number: 1002,
      creditFor: 'i1',
      ocr: createOcr(1002),
      lines: invoice.lines.map((l) => ({ ...l, quantity: -l.quantity })),
    };
    const t = renderInvoice(credit, customer, settings, invoice).textContent ?? '';
    expect(t).toContain('KREDITFAKTURA');
    expect(t).toContain('Avser faktura nr 1001, daterad 2026-02-01');
    expect(t).toContain('Att få tillbaka');
    expect(t).toContain('3 338,00 kr');
    expect(t).not.toContain('Bankgiro');
    expect(t).not.toContain('Förfallodatum');
    expect(t).not.toContain(createOcr(1002));
  });
});
