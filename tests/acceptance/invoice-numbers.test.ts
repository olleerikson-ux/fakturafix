/**
 * Acceptanstester: löpnummer och radering (AGENTS.md, "Löpnummer").
 * - Fakturanumren bildar en obruten serie och får aldrig återanvändas.
 * - Utkast har number 0 och ocr ''. Numret delas ut när fakturan utfärdas.
 * - En utfärdad faktura får aldrig raderas: deleteInvoice kastar fel.
 */
import { describe, expect, it } from 'vitest';
import { createLocalStore, createOcr, type Invoice, type Store } from '../../src/core';
import { invoice, memoryStorage } from './helpers';

/** Skapar ett utkast utan nummer, som gränssnittet gör. */
function createDraft(store: Store, id: string): Invoice {
  const draft = invoice({ id, number: 0, ocr: '', status: 'draft' });
  store.saveInvoice(draft);
  return draft;
}

/** Utfärdar en faktura: delar ut nästa nummer och OCR och sätter status 'sent'. */
function issue(store: Store, id: string): number {
  const existing = store.getInvoice(id) ?? createDraft(store, id);
  const number = store.nextInvoiceNumber();
  store.saveInvoice({ ...existing, number, ocr: createOcr(number), status: 'sent' });
  return number;
}

describe('löpnummer: obruten serie', () => {
  it('ger 1001, 1002, 1003 … utan luckor', () => {
    const store = createLocalStore(memoryStorage());
    const numbers = ['a', 'b', 'c', 'd', 'e'].map((id) => issue(store, id));
    expect(numbers).toEqual([1001, 1002, 1003, 1004, 1005]);
  });

  it('ger samma nummer igen om det inte har använts', () => {
    const store = createLocalStore(memoryStorage());
    expect(store.nextInvoiceNumber()).toBe(1001);
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('fortsätter serien i ett nytt store på samma storage', () => {
    const storage = memoryStorage();
    issue(createLocalStore(storage), 'a');
    issue(createLocalStore(storage), 'b');
    expect(createLocalStore(storage).nextInvoiceNumber()).toBe(1003);
  });
});

describe('löpnummer: utkast', () => {
  it('ett utkast med nummer 0 påverkar inte serien', () => {
    const store = createLocalStore(memoryStorage());
    createDraft(store, 'utkast');
    expect(store.nextInvoiceNumber()).toBe(1001);
    issue(store, 'a');
    createDraft(store, 'utkast-2');
    expect(store.nextInvoiceNumber()).toBe(1002);
  });

  it('radering av ett utkast ger ingen lucka i serien', () => {
    const store = createLocalStore(memoryStorage());
    issue(store, 'a');
    createDraft(store, 'utkast');
    store.deleteInvoice('utkast');
    expect(store.getInvoice('utkast')).toBeUndefined();
    expect(issue(store, 'b')).toBe(1002);
  });

  it('ett utkast får sitt nummer först när det utfärdas', () => {
    const store = createLocalStore(memoryStorage());
    createDraft(store, 'först-skapad');
    issue(store, 'senare-skapad');
    expect(issue(store, 'först-skapad')).toBe(1002);
    expect(store.getInvoice('först-skapad')?.ocr).toBe(createOcr(1002));
  });

  it('radering av ett utkast påverkar inte utfärdade fakturor', () => {
    const store = createLocalStore(memoryStorage());
    issue(store, 'a');
    createDraft(store, 'utkast');
    store.deleteInvoice('utkast');
    expect(store.listInvoices().map((i) => i.number)).toEqual([1001]);
  });
});

describe('utfärdade fakturor raderas aldrig', () => {
  it('deleteInvoice kastar fel för en skickad faktura och fakturan finns kvar', () => {
    const store = createLocalStore(memoryStorage());
    issue(store, 'a');
    expect(() => store.deleteInvoice('a')).toThrow();
    expect(store.getInvoice('a')?.number).toBe(1001);
    expect(store.nextInvoiceNumber()).toBe(1002);
  });

  it('deleteInvoice kastar fel för en betald faktura och fakturan finns kvar', () => {
    const store = createLocalStore(memoryStorage());
    issue(store, 'a');
    const sent = store.getInvoice('a');
    if (!sent) throw new Error('Fakturan sparades inte');
    store.saveInvoice({ ...sent, status: 'paid', paidDate: '2026-03-20' });
    expect(() => store.deleteInvoice('a')).toThrow();
    expect(store.getInvoice('a')?.status).toBe('paid');
  });

  it('en utfärdad faktura kan inte raderas genom att först sparas som utkast', () => {
    const store = createLocalStore(memoryStorage());
    issue(store, 'a');
    const sent = store.getInvoice('a');
    if (!sent) throw new Error('Fakturan sparades inte');
    try {
      store.saveInvoice({ ...sent, status: 'draft' });
      store.deleteInvoice('a');
    } catch {
      // Att vägra något av stegen är godtagbart.
    }
    expect(store.getInvoice('a')?.number).toBe(1001);
  });
});

describe('utfärdade fakturor är låsta (issue #12)', () => {
  function issuedStore(): Store {
    const store = createLocalStore(memoryStorage());
    issue(store, 'a');
    return store;
  }

  function issued(store: Store): Invoice {
    const inv = store.getInvoice('a');
    if (!inv) throw new Error('Fakturan sparades inte');
    return inv;
  }

  it('kan markeras som betald med betaldatum', () => {
    const store = issuedStore();
    store.saveInvoice({ ...issued(store), status: 'paid', paidDate: '2026-03-20' });
    expect(store.getInvoice('a')?.status).toBe('paid');
    expect(store.getInvoice('a')?.paidDate).toBe('2026-03-20');
  });

  it('kan inte få ändrade rader, kund eller datum', () => {
    const store = issuedStore();
    const inv = issued(store);
    expect(() =>
      store.saveInvoice({ ...inv, lines: [{ ...inv.lines[0]!, unitPrice: 1 }] }),
    ).toThrow();
    expect(() => store.saveInvoice({ ...inv, customerId: 'annan-kund' })).toThrow();
    expect(() => store.saveInvoice({ ...inv, dueDate: '2027-01-01' })).toThrow();
    expect(store.getInvoice('a')).toEqual(inv);
  });

  it('en betald faktura kan inte gå tillbaka till skickad', () => {
    const store = issuedStore();
    store.saveInvoice({ ...issued(store), status: 'paid', paidDate: '2026-03-20' });
    expect(() => store.saveInvoice({ ...issued(store), status: 'sent', paidDate: undefined })).toThrow();
    expect(store.getInvoice('a')?.status).toBe('paid');
  });
});
