import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalStore } from './storage';
import type { CompanySettings, Customer, Invoice } from './types';

const customer: Customer = {
  id: 'k1',
  name: 'Testkund AB',
  orgNumber: '556000-0000',
  address: { street: 'Testgatan 1', postalCode: '111 22', city: 'Teststad' },
  createdAt: '2026-11-01T10:00:00.000Z',
};

function invoice(id: string, number: number): Invoice {
  return {
    id,
    number,
    customerId: 'k1',
    issueDate: '2026-11-01',
    dueDate: '2026-12-01',
    lines: [],
    ocr: '',
    status: 'draft',
    createdAt: '2026-11-01T10:00:00.000Z',
  };
}

const settings: CompanySettings = {
  name: 'Testfirma',
  orgNumber: '556000-0000',
  address: { street: 'Testvägen 2', postalCode: '222 33', city: 'Testby' },
  fSkatt: true,
  paymentTermsDays: 30,
};

describe('createLocalStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('använder localStorage som standard och sparar en version', () => {
    const store = createLocalStore();
    store.saveCustomer(customer);
    expect(localStorage.getItem('fakturafix:version')).toBe('1');
    expect(localStorage.getItem('fakturafix:customers')).toContain('Testkund AB');
  });

  it('sparar, uppdaterar, hämtar och tar bort kunder', () => {
    const store = createLocalStore(localStorage);
    expect(store.listCustomers()).toEqual([]);

    store.saveCustomer(customer);
    store.saveCustomer({ ...customer, id: 'k2', name: 'Annan Testkund AB' });
    store.saveCustomer({ ...customer, name: 'Testkund AB (ny)' });

    expect(store.listCustomers().map((c) => c.name)).toEqual(['Testkund AB (ny)', 'Annan Testkund AB']);
    expect(store.getCustomer('k1')?.name).toBe('Testkund AB (ny)');
    expect(store.getCustomer('saknas')).toBeUndefined();

    store.deleteCustomer('k1');
    expect(store.listCustomers().map((c) => c.id)).toEqual(['k2']);
  });

  it('sparar, uppdaterar, hämtar och tar bort fakturor', () => {
    const store = createLocalStore(localStorage);
    store.saveInvoice(invoice('f1', 1001));
    store.saveInvoice({ ...invoice('f1', 1001), status: 'sent' });

    expect(store.listInvoices()).toHaveLength(1);
    expect(store.getInvoice('f1')?.status).toBe('sent');

    store.deleteInvoice('f1');
    expect(store.getInvoice('f1')).toBeUndefined();
  });

  it('ger 1001 som första fakturanummer och sedan högsta plus 1', () => {
    const store = createLocalStore(localStorage);
    expect(store.nextInvoiceNumber()).toBe(1001);
    store.saveInvoice(invoice('f1', 1001));
    store.saveInvoice(invoice('f2', 1005));
    store.saveInvoice(invoice('f3', 1002));
    expect(store.nextInvoiceNumber()).toBe(1006);
  });

  it('sparar och hämtar företagsinställningar', () => {
    const store = createLocalStore(localStorage);
    expect(store.getSettings()).toBeUndefined();
    store.saveSettings(settings);
    expect(store.getSettings()).toEqual(settings);
  });

  it('delar data mellan instanser', () => {
    createLocalStore(localStorage).saveCustomer(customer);
    expect(createLocalStore(localStorage).getCustomer('k1')).toEqual(customer);
  });

  it('behandlar trasig JSON som tom data utan att krascha', () => {
    localStorage.setItem('fakturafix:customers', '{inte json');
    localStorage.setItem('fakturafix:invoices', '{"inte":"en lista"}');
    localStorage.setItem('fakturafix:settings', '[1,2,3]');
    const store = createLocalStore(localStorage);

    expect(store.listCustomers()).toEqual([]);
    expect(store.listInvoices()).toEqual([]);
    expect(store.nextInvoiceNumber()).toBe(1001);
    expect(store.getSettings()).toBeUndefined();

    store.saveCustomer(customer);
    expect(store.listCustomers()).toEqual([customer]);
  });

  it('hoppar över poster utan id', () => {
    localStorage.setItem('fakturafix:customers', JSON.stringify([null, 42, { name: 'utan id' }, customer]));
    expect(createLocalStore(localStorage).listCustomers()).toEqual([customer]);
  });

  it('skriver inte över en befintlig version', () => {
    localStorage.setItem('fakturafix:version', '2');
    createLocalStore(localStorage);
    expect(localStorage.getItem('fakturafix:version')).toBe('2');
  });
});
