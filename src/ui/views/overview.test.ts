import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, Store } from '../../core/index';
import { createMemoryStore } from '../test-utils';
import { computeKpis, matchesSearch, overviewView, statusLabel } from './overview';

function invoice(id: string, over: Partial<Invoice>): Invoice {
  return {
    id,
    number: 1001,
    customerId: 'k1',
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    lines: [{ id: 'l', description: 'Tjänst', quantity: 1, unitPrice: 10000, vatRate: 25 }],
    ocr: '',
    status: 'sent',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('computeKpis', () => {
  it('summerar obetalt, förfallet och betalt i år', () => {
    const k = computeKpis(
      [
        invoice('a', { dueDate: '2026-12-31' }),
        invoice('b', { dueDate: '2026-01-31' }),
        invoice('c', { status: 'paid', paidDate: '2026-03-01' }),
        invoice('d', { status: 'paid', paidDate: '2025-03-01' }),
        invoice('e', { status: 'draft', number: 0 }),
      ],
      '2026-06-01',
    );
    expect(k).toEqual({ unpaid: 25000, overdue: 12500, paidThisYear: 12500 });
  });
});

describe('computeKpis med kreditfakturor', () => {
  it('ger netto noll för en helt krediterad obetald faktura', () => {
    const credit = invoice('c', { number: 1002, creditFor: 'a', issueDate: '2026-02-01', lines: [{ id: 'l', description: 'Tjänst', quantity: -1, unitPrice: 10000, vatRate: 25 }] });
    expect(computeKpis([invoice('a', { dueDate: '2026-12-31' }), credit], '2026-06-01')).toEqual({ unpaid: 0, overdue: 0, paidThisYear: 0 });
  });
});

describe('statusLabel', () => {
  it('faller tillbaka på rått värde för okända statusar', () => {
    expect(statusLabel('overdue')).toBe('Förfallen');
    expect(statusLabel('credited')).toBe('Krediterad');
    expect(statusLabel('okand-status')).toBe('okand-status');
  });
});

describe('overviewView', () => {
  let root: HTMLElement;
  let store: Store;
  beforeEach(() => {
    root = document.createElement('div');
    store = createMemoryStore();
  });

  it('visar uppmaning när listan är tom', () => {
    overviewView(root, store);
    expect(root.textContent).toContain('Skapa din första faktura');
  });

  it('markerar som betald och filtrerar', () => {
    store.saveInvoice(invoice('a', {}));
    overviewView(root, store);
    const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Markera som betald');
    btn?.click();
    expect(store.getInvoice('a')?.status).toBe('paid');
    expect(store.getInvoice('a')?.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = 'draft';
    select.dispatchEvent(new Event('change'));
    expect(root.textContent).toContain('Inga fakturor matchar');
  });

  it('visar fel när saveInvoice kastar', () => {
    store.saveInvoice(invoice('a', {}));
    vi.spyOn(store, 'saveInvoice').mockImplementation(() => {
      throw new Error('full');
    });
    overviewView(root, store);
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Markera som betald')?.click();
    expect(root.querySelector('[role=status]')?.textContent).toContain('Kunde inte spara');
  });
});

describe('sökning i översikten', () => {
  const inv = invoice('a', { number: 1042, lines: [{ id: 'l', description: 'Tjänst', quantity: 1, unitPrice: 1250000, vatRate: 25 }] });

  it('matchar kundnamn, fakturanummer och belopp', () => {
    expect(matchesSearch(inv, 'Testkund AB', 'testkund')).toBe(true);
    expect(matchesSearch(inv, 'Testkund AB', '1042')).toBe(true);
    expect(matchesSearch(inv, 'Testkund AB', '#1042')).toBe(true);
    expect(matchesSearch(inv, 'Testkund AB', '15 625')).toBe(true);
    expect(matchesSearch(inv, 'Testkund AB', '15625,00')).toBe(true);
    expect(matchesSearch(inv, 'Testkund AB', 'finns inte')).toBe(false);
    expect(matchesSearch(inv, 'Testkund AB', '  ')).toBe(true);
  });

  it('kombineras med statusfiltret i vyn', () => {
    const store = createMemoryStore();
    store.saveCustomer({ id: 'k1', name: 'Testkund AB', address: { street: 'G 1', postalCode: '123 45', city: 'S' }, createdAt: '2026-01-01T00:00:00.000Z' });
    store.saveCustomer({ id: 'k2', name: 'Annan AB', address: { street: 'G 1', postalCode: '123 45', city: 'S' }, createdAt: '2026-01-01T00:00:00.000Z' });
    store.saveInvoice(invoice('a', { number: 1001, customerId: 'k1', status: 'paid', paidDate: '2026-03-01' }));
    store.saveInvoice(invoice('b', { number: 1002, customerId: 'k2', status: 'paid', paidDate: '2026-03-01' }));
    const root = document.createElement('div');
    overviewView(root, store);
    const search = root.querySelector<HTMLInputElement>('#invoice-search');
    if (!search) throw new Error('Sökfältet saknas');
    search.value = 'annan';
    search.dispatchEvent(new Event('input'));
    const rows = () => root.querySelectorAll('tbody tr').length;
    expect(rows()).toBe(1);
    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = 'draft';
    select.dispatchEvent(new Event('change'));
    expect(root.textContent).toContain('Inga fakturor matchar sökningen');
  });
});
