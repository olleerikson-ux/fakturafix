import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanySettings, Customer, Invoice } from '../core/index';
import { buildReminderMailto, getRemindedDate, reminderBodyLines, reminderSubject } from './email';
import { openEmailDialog } from './email-dialog';
import { createMemoryStore } from './test-utils';
import { exportFileName, periodRange } from './views/export-section';
import { overviewView } from './views/overview';
import { settingsView } from './views/settings';

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
  email: 'faktura@testkund.example',
  address: { street: 'Gatan 2', postalCode: '543 21', city: 'By' },
  createdAt: '2026-01-01T00:00:00.000Z',
};
const overdue: Invoice = {
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

describe('påminnelsemejl', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => document.body.replaceChildren());

  it('har ämnet "Påminnelse: faktura {nr}" och en vänlig text med belopp', () => {
    expect(reminderSubject(overdue)).toBe('Påminnelse: faktura 1001');
    const body = reminderBodyLines(overdue, settings, '2026-03-02').join('\n');
    expect(body).toContain('Om du redan har betalat kan du bortse från detta');
    expect(body).toContain('Summa att betala');
    expect(body).toContain('Betala senast: 2026-03-12');
    const url = buildReminderMailto(overdue, customer, settings, '2026-03-02');
    expect(url).toContain('subject=' + encodeURIComponent('Påminnelse: faktura 1001'));
    expect(url).toContain('%0D%0A');
  });

  it('dialogen för påminnelse öppnar mailto och sparar datumet', () => {
    const store = createMemoryStore();
    store.saveCustomer(customer);
    store.saveSettings(settings);
    store.saveInvoice(overdue);
    const open = vi.fn();
    openEmailDialog(store, 'i1', undefined, open, 'reminder');
    expect(document.body.textContent).toContain('Skicka påminnelse');
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Öppna mejlprogrammet')?.click();
    expect(String(open.mock.calls[0]?.[0])).toContain(encodeURIComponent('Påminnelse: faktura 1001'));
    expect(getRemindedDate('i1')).toBeDefined();
  });

  it('översikten visar "Skicka påminnelse" bara för förfallna fakturor', () => {
    const store = createMemoryStore();
    store.saveCustomer(customer);
    store.saveSettings(settings);
    store.saveInvoice(overdue);
    store.saveInvoice({ ...overdue, id: 'i2', number: 1002, status: 'paid', paidDate: '2026-02-01' });
    const root = document.createElement('div');
    overviewView(root, store);
    expect([...root.querySelectorAll('button')].filter((b) => b.textContent === 'Skicka påminnelse')).toHaveLength(1);
  });
});

describe('påminnelseavgift och export i Inställningar', () => {
  it('sparar avgiften i öre och avvisar mer än 60 kr', () => {
    const store = createMemoryStore();
    store.saveSettings({ ...settings, reminderFee: undefined });
    const root = document.createElement('div');
    document.body.append(root);
    settingsView(root, store);
    const form = root.querySelector('form') as HTMLFormElement;
    const field = form.elements.namedItem('reminderFee') as HTMLInputElement;
    field.value = '70';
    form.requestSubmit();
    expect(store.getSettings()?.reminderFee).toBeUndefined();
    expect(root.textContent).toContain('högst');
    field.value = '60';
    form.requestSubmit();
    expect(store.getSettings()?.reminderFee).toBe(6000);
    root.remove();
  });

  it('periodRange och filnamn', () => {
    expect(periodRange('this-year', '2026-11-17', { from: '', to: '' })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(periodRange('last-year', '2026-11-17', { from: '', to: '' })).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(periodRange('custom', '2026-11-17', { from: '2026-02-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-03-31' });
    expect(periodRange('custom', '2026-11-17', { from: '2026-04-01', to: '2026-03-31' })).toBeNull();
    expect(periodRange('custom', '2026-11-17', { from: 'x', to: '' })).toBeNull();
    expect(exportFileName('2026-11-17')).toBe('fakturafix-export-2026-11-17.csv');
  });

  it('Exportera laddar ner en CSV med BOM', async () => {
    const store = createMemoryStore();
    store.saveCustomer(customer);
    store.saveSettings(settings);
    store.saveInvoice(overdue);
    let captured: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => ((captured = blob), 'blob:test'));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const root = document.createElement('div');
    document.body.append(root);
    settingsView(root, store);
    (root.querySelector('#export-period') as HTMLSelectElement).value = 'custom';
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Exportera till bokföring (CSV)')?.click();
    expect(click).toHaveBeenCalledOnce();
    const text = await captured?.text();
    expect(text).toContain('Fakturanummer');
    expect(text).toContain('1001');
    expect(root.textContent).toContain('nedladdad');
    root.remove();
    click.mockRestore();
  });
});
