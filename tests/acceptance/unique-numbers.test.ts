/**
 * Acceptanstester för issue #19: unika fakturanummer.
 * När en faktura får ett nummer (draft -> sent, eller ny med number > 0) ska
 * saveInvoice läsa lagringen på nytt och kräva att numret är nästa lediga
 * och att ocr är createOcr(number). Annars kastas fel.
 */
import { describe, expect, it } from 'vitest';
import { createLocalStore, createOcr, type Invoice, type Store } from '../../src/core';
import { invoice, memoryStorage } from './helpers';

function draft(id: string): Invoice {
  return invoice({ id, number: 0, ocr: '', status: 'draft' });
}

function issued(id: string, number: number): Invoice {
  return invoice({ id, number, ocr: createOcr(number), status: 'sent' });
}

function issueNext(store: Store, id: string): number {
  const number = store.nextInvoiceNumber();
  store.saveInvoice(issued(id, number));
  return number;
}

describe('unika fakturanummer: flera flikar', () => {
  it('två flikar kan inte båda utfärda samma nummer', () => {
    const storage = memoryStorage();
    const tab1 = createLocalStore(storage);
    const tab2 = createLocalStore(storage);
    const n1 = tab1.nextInvoiceNumber();
    const n2 = tab2.nextInvoiceNumber();
    expect(n1).toBe(1001);
    expect(n2).toBe(1001);

    tab1.saveInvoice(issued('flik-1', n1));
    expect(() => tab2.saveInvoice(issued('flik-2', n2))).toThrow();

    expect(createLocalStore(storage).listInvoices().map((i) => i.number)).toEqual([1001]);
    expect(tab2.getInvoice('flik-2')).toBeUndefined();
  });

  it('samma sak när ett utkast utfärdas i den andra fliken', () => {
    const storage = memoryStorage();
    const tab1 = createLocalStore(storage);
    const tab2 = createLocalStore(storage);
    tab2.saveInvoice(draft('utkast'));
    const stale = tab2.nextInvoiceNumber();
    issueNext(tab1, 'annan');
    expect(() => tab2.saveInvoice({ ...draft('utkast'), number: stale, ocr: createOcr(stale), status: 'sent' })).toThrow();
    expect(tab2.getInvoice('utkast')?.status).toBe('draft');
    expect(tab2.getInvoice('utkast')?.number).toBe(0);
  });

  it('ett nytt försök med ett färskt nummer lyckas', () => {
    const storage = memoryStorage();
    const tab1 = createLocalStore(storage);
    const tab2 = createLocalStore(storage);
    const stale = tab2.nextInvoiceNumber();
    issueNext(tab1, 'a');
    expect(() => tab2.saveInvoice(issued('b', stale))).toThrow();
    expect(issueNext(tab2, 'b')).toBe(1002);
    expect(createLocalStore(storage).listInvoices().map((i) => i.number).sort()).toEqual([1001, 1002]);
  });
});

describe('unika fakturanummer: bara nästa lediga nummer', () => {
  it('ett redan använt nummer vägras', () => {
    const store = createLocalStore(memoryStorage());
    issueNext(store, 'a');
    issueNext(store, 'b');
    expect(() => store.saveInvoice(issued('c', 1001))).toThrow();
    expect(() => store.saveInvoice(issued('c', 1002))).toThrow();
    expect(store.getInvoice('c')).toBeUndefined();
  });

  it('ett nummer som hoppar över ett annat vägras, eftersom serien måste vara obruten', () => {
    const store = createLocalStore(memoryStorage());
    expect(() => store.saveInvoice(issued('a', 1002))).toThrow();
    expect(() => store.saveInvoice(issued('a', 1500))).toThrow();
    expect(store.listInvoices()).toEqual([]);
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('gäller även en ny faktura som sparas direkt som betald', () => {
    const store = createLocalStore(memoryStorage());
    issueNext(store, 'a');
    const paid = { ...issued('b', 1001), status: 'paid' as const, paidDate: '2026-03-20' };
    expect(() => store.saveInvoice(paid)).toThrow();
    store.saveInvoice({ ...paid, number: 1002, ocr: createOcr(1002) });
    expect(store.getInvoice('b')?.number).toBe(1002);
  });

  it('ett nummer under 1001 vägras när fakturan utfärdas', () => {
    const store = createLocalStore(memoryStorage());
    expect(() => store.saveInvoice(issued('a', 1000))).toThrow();
    expect(() => store.saveInvoice(issued('a', 1))).toThrow();
  });
});

describe('unika fakturanummer: OCR', () => {
  it('ocr måste vara createOcr(number)', () => {
    const store = createLocalStore(memoryStorage());
    expect(() => store.saveInvoice({ ...issued('a', 1001), ocr: '' })).toThrow();
    expect(() => store.saveInvoice({ ...issued('a', 1001), ocr: '100165' })).toThrow();
    expect(() => store.saveInvoice({ ...issued('a', 1001), ocr: createOcr(1002) })).toThrow();
    expect(store.listInvoices()).toEqual([]);
    store.saveInvoice(issued('a', 1001));
    expect(store.getInvoice('a')?.ocr).toBe('100164');
  });
});

describe('unika fakturanummer: det som ska fungera som förut', () => {
  it('ett utkast med nummer 0 kan sparas flera gånger', () => {
    const store = createLocalStore(memoryStorage());
    issueNext(store, 'a');
    store.saveInvoice(draft('u1'));
    store.saveInvoice({ ...draft('u1'), notes: 'Ändrat' });
    store.saveInvoice(draft('u2'));
    expect(store.nextInvoiceNumber()).toBe(1002);
  });

  it('en utfärdad faktura kan sparas igen med samma nummer, t.ex. som betald', () => {
    const store = createLocalStore(memoryStorage());
    issueNext(store, 'a');
    issueNext(store, 'b');
    const first = store.getInvoice('a');
    if (!first) throw new Error('Fakturan sparades inte');
    store.saveInvoice({ ...first, status: 'paid', paidDate: '2026-03-20' });
    expect(store.getInvoice('a')?.status).toBe('paid');
    expect(store.getInvoice('a')?.number).toBe(1001);
  });

  it('ett utkast utfärdas med nästa lediga nummer', () => {
    const store = createLocalStore(memoryStorage());
    store.saveInvoice(draft('u'));
    const n = store.nextInvoiceNumber();
    store.saveInvoice({ ...draft('u'), number: n, ocr: createOcr(n), status: 'sent' });
    expect(store.getInvoice('u')?.number).toBe(1001);
  });
});
