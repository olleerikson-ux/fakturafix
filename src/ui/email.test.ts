import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanySettings, Customer, Invoice } from '../core/index';
import { openEmailDialog } from './email-dialog';
import { buildMailto, emailBodyLines, emailSubject, getEmailedDate, markEmailed } from './email';
import { createMemoryStore } from './test-utils';

const settings: CompanySettings = {
  name: 'Testfirman & Co',
  orgNumber: '556000-0000',
  address: { street: 'Vägen 1', postalCode: '123 45', city: 'Stad' },
  bankgiro: '123-4567',
  fSkatt: true,
  paymentTermsDays: 30,
};
const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  email: 'faktura@testkund.example',
  address: { street: 'Gatan 2', postalCode: '543 21', city: 'By' },
  createdAt: '2026-01-01T00:00:00.000Z',
};
const invoice: Invoice = {
  id: 'i1',
  number: 1001,
  customerId: 'k1',
  issueDate: '2026-02-01',
  dueDate: '2026-03-03',
  ocr: '100164',
  status: 'sent',
  createdAt: '2026-02-01T00:00:00.000Z',
  lines: [{ id: 'a', description: 'Tjänst', quantity: 1, unitPrice: 100000, vatRate: 25 }],
};

function parts(url: string) {
  const [head = '', query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  return { to: head.replace('mailto:', ''), subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
}

describe('buildMailto', () => {
  it('kodar ämne och text, och använder %0D%0A för radbrytningar', () => {
    const url = buildMailto(invoice, customer, settings);
    expect(url.startsWith('mailto:faktura@testkund.example?subject=')).toBe(true);
    expect(url).toContain('%0D%0A');
    expect(url).not.toMatch(/[ \n&]body=.*[ \n]/);
    const { subject, body } = parts(url);
    expect(subject).toBe('Faktura 1001 från Testfirman & Co');
    expect(url).toContain(encodeURIComponent('Testfirman & Co'));
    for (const part of ['Att betala: 1 250,00 kr', 'Förfallodatum: 2026-03-03', 'Bankgiro: 123-4567', 'OCR-nummer: 100164']) {
      expect(body).toContain(part);
    }
    expect(body.endsWith('Testfirman & Co')).toBe(true);
  });

  it('lämnar mottagaren tom när kunden saknar e-post', () => {
    const { email: _email, ...noEmail } = customer;
    expect(buildMailto(invoice, noEmail, settings).startsWith('mailto:?subject=')).toBe(true);
  });

  it('kreditfaktura får egen text med beloppet att få tillbaka', () => {
    const credit: Invoice = {
      ...invoice,
      id: 'c1',
      number: 1002,
      creditFor: 'i1',
      lines: [{ id: 'a', description: 'Tjänst', quantity: -1, unitPrice: 100000, vatRate: 25 }],
    };
    expect(emailSubject(credit, settings)).toBe('Kreditfaktura 1002 från Testfirman & Co');
    const body = emailBodyLines(credit, settings, invoice).join('\n');
    expect(body).toContain('kreditfaktura 1002');
    expect(body).toContain('faktura nr 1001, daterad 2026-02-01');
    expect(body).toContain('Belopp att få tillbaka: 1 250,00 kr');
    expect(body).not.toContain('Bankgiro');
  });
});

describe('mejlat-datum och dialog', () => {
  beforeEach(() => localStorage.clear());

  it('sparar datumet i UI-lagringen', () => {
    expect(getEmailedDate('i1')).toBeUndefined();
    markEmailed('i1', '2026-05-05');
    expect(getEmailedDate('i1')).toBe('2026-05-05');
    expect(localStorage.getItem('fakturafix-ui:emailed')).toContain('i1');
  });

  it('Öppna mejlprogrammet öppnar mailto, sparar datumet och stänger dialogen', () => {
    const store = createMemoryStore();
    store.saveCustomer(customer);
    store.saveSettings(settings);
    store.saveInvoice(invoice);
    const open = vi.fn();
    const onSent = vi.fn();
    openEmailDialog(store, 'i1', onSent, open);
    expect(document.body.textContent).toContain('Bifoga PDF:en och skicka');
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Öppna mejlprogrammet')?.click();
    expect(open).toHaveBeenCalledOnce();
    expect(String(open.mock.calls[0]?.[0])).toContain('mailto:faktura@testkund.example');
    expect(onSent).toHaveBeenCalledOnce();
    expect(getEmailedDate('i1')).toBeDefined();
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('visar fel och stänger inte när företagsuppgifter saknas, och Escape stänger', () => {
    const store = createMemoryStore();
    store.saveCustomer(customer);
    store.saveInvoice(invoice);
    const open = vi.fn();
    openEmailDialog(store, 'i1', undefined, open);
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Öppna mejlprogrammet')?.click();
    expect(open).not.toHaveBeenCalled();
    expect(document.querySelector('.modal [role="alert"]')?.textContent).toContain('Inställningar');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('fångar fokus med Tab och Shift+Tab i dialogen', () => {
    const store = createMemoryStore();
    store.saveCustomer(customer);
    store.saveSettings(settings);
    store.saveInvoice(invoice);
    openEmailDialog(store, 'i1', undefined, vi.fn());
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.modal button')];
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1]?.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    document.dispatchEvent(back);
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
});
