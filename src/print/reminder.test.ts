import { describe, expect, it } from 'vitest';
import type { CompanySettings, Customer, Invoice } from '../core/index';
import { renderReminder } from './reminder';

const settings: CompanySettings = {
  name: 'Testfirman HB',
  orgNumber: '556000-0000',
  address: { street: 'Vägen 1', postalCode: '123 45', city: 'Stad' },
  bankgiro: '123-4567',
  fSkatt: true,
  paymentTermsDays: 30,
  lateInterestPercent: 8,
  reminderFee: 6000,
};
const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  address: { street: 'Gatan 2', postalCode: '543 21', city: 'By' },
  createdAt: '2026-01-01T00:00:00.000Z',
};
const invoice: Invoice = {
  id: 'i1',
  number: 1001,
  customerId: 'k1',
  issueDate: '2026-01-01',
  dueDate: '2026-01-31',
  ocr: '100164',
  status: 'sent',
  createdAt: '2026-01-01T00:00:00.000Z',
  lines: [{ id: 'a', description: 'Tjänst', quantity: 1, unitPrice: 800000, vatRate: 25 }],
};

describe('renderReminder', () => {
  it('visar rubrik, hänvisning, belopp, ny betaldag och betaluppgifter', () => {
    const t = renderReminder(invoice, customer, settings, '2026-03-02').textContent ?? '';
    expect(t).toContain('BETALNINGSPÅMINNELSE');
    expect(t).toContain('Vi har inte fått betalt för faktura 1001, daterad 2026-01-01, med förfallodatum 2026-01-31');
    expect(t).toContain('Om du redan har betalat kan du bortse från detta');
    expect(t).toContain('Ursprungligt belopp');
    expect(t).toContain('10 000,00 kr');
    expect(t).toContain('Dröjsmålsränta 8 % (30 dagar)');
    expect(t).toContain('Påminnelseavgift');
    expect(t).toContain('60,00 kr');
    expect(t).toContain('Betala senast');
    expect(t).toContain('2026-03-12');
    expect(t).toContain('123-4567');
    expect(t).toContain('100164');
  });

  it('utelämnar ränta och avgift när de saknas i inställningarna', () => {
    const { lateInterestPercent: _l, reminderFee: _f, ...bare } = settings;
    const t = renderReminder(invoice, customer, bare, '2026-03-02').textContent ?? '';
    expect(t).not.toContain('Dröjsmålsränta');
    expect(t).not.toContain('Påminnelseavgift');
    expect(t).toContain('Summa att betala');
  });

  it('kastar kärnans fel för betald faktura', () => {
    expect(() => renderReminder({ ...invoice, status: 'paid' }, customer, settings, '2026-03-02')).toThrow(/betald/);
  });
});
