import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../core/index';
import { createMemoryStore } from '../ui/test-utils';
import { printInvoice } from './print';

const invoice: Invoice = {
  id: 'i1',
  number: 1001,
  customerId: 'k1',
  issueDate: '2026-02-01',
  dueDate: '2026-03-03',
  ocr: '100164',
  status: 'sent',
  createdAt: '2026-02-01T00:00:00.000Z',
  lines: [{ id: 'a', description: 'Tjänst', quantity: 1, unitPrice: 10000, vatRate: 25 }],
};

describe('printInvoice', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('ger fel när uppgifter saknas', () => {
    const store = createMemoryStore();
    expect(printInvoice(store, 'finns-inte')).toBe('Fakturan finns inte.');
    store.saveInvoice(invoice);
    expect(printInvoice(store, 'i1')).toBe('Kunden för fakturan saknas.');
  });

  it('renderar fakturan och anropar window.print', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const store = createMemoryStore();
    store.saveInvoice(invoice);
    store.saveCustomer({ id: 'k1', name: 'Testkund AB', address: { street: 'Gatan 1', postalCode: '123 45', city: 'Stad' }, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(printInvoice(store, 'i1')).toContain('företagsuppgifter');
    store.saveSettings({ name: 'Testfirman HB', orgNumber: '556000-0000', address: { street: 'Vägen 1', postalCode: '123 45', city: 'Stad' }, fSkatt: true, paymentTermsDays: 30 });
    expect(printInvoice(store, 'i1')).toBeUndefined();
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector('#print-root .invoice-print')?.textContent).toContain('Testkund AB');
  });
});
