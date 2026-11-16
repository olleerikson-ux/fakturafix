/**
 * Acceptanstester: löpnummer och radering (AGENTS.md, "Löpnummer").
 * - Fakturanumren bildar en obruten serie och får aldrig återanvändas.
 * - En utfärdad faktura (status skild från draft) får aldrig raderas.
 *
 * Kontraktet säger inte om deleteInvoice ska kasta fel eller ignorera anropet
 * för en utfärdad faktura. Testerna godtar båda, men fakturan måste finnas kvar.
 */
import { describe, expect, it } from 'vitest';
import { createLocalStore, type InvoiceStatus, type Store } from '../../src/core';
import { invoice, memoryStorage } from './helpers';

/** Skapar en faktura med nästa lediga nummer, på samma sätt som gränssnittet gör. */
function createNext(store: Store, status: InvoiceStatus = 'sent'): number {
  const number = store.nextInvoiceNumber();
  store.saveInvoice(invoice({ id: `f-${number}`, number, status }));
  return number;
}

function tryDelete(store: Store, id: string): void {
  try {
    store.deleteInvoice(id);
  } catch {
    // Att kasta fel är ett godtagbart sätt att vägra radera.
  }
}

describe('löpnummer: obruten serie', () => {
  it('ger 1001, 1002, 1003 … utan luckor', () => {
    const store = createLocalStore(memoryStorage());
    const numbers = Array.from({ length: 5 }, () => createNext(store));
    expect(numbers).toEqual([1001, 1002, 1003, 1004, 1005]);
  });

  it('ger samma nummer igen om det inte har använts', () => {
    const store = createLocalStore(memoryStorage());
    expect(store.nextInvoiceNumber()).toBe(1001);
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('fortsätter serien i ett nytt store på samma storage', () => {
    const storage = memoryStorage();
    createNext(createLocalStore(storage));
    createNext(createLocalStore(storage));
    expect(createLocalStore(storage).nextInvoiceNumber()).toBe(1003);
  });
});

describe('löpnummer: återanvänds aldrig', () => {
  it('återanvänder inte numret när det senaste utkastet raderas', () => {
    const store = createLocalStore(memoryStorage());
    createNext(store);
    const draftNumber = createNext(store, 'draft');
    store.deleteInvoice(`f-${draftNumber}`);
    expect(store.getInvoice(`f-${draftNumber}`)).toBeUndefined();
    expect(store.nextInvoiceNumber()).toBeGreaterThan(draftNumber);
  });

  it('återanvänder inte numret när alla fakturor är utkast som raderats', () => {
    const store = createLocalStore(memoryStorage());
    const n = createNext(store, 'draft');
    store.deleteInvoice(`f-${n}`);
    expect(store.listInvoices()).toEqual([]);
    expect(store.nextInvoiceNumber()).toBeGreaterThan(n);
  });

  it('kommer ihåg använda nummer även i ett nytt store', () => {
    const storage = memoryStorage();
    const first = createLocalStore(storage);
    const n = createNext(first, 'draft');
    first.deleteInvoice(`f-${n}`);
    expect(createLocalStore(storage).nextInvoiceNumber()).toBeGreaterThan(n);
  });
});

describe('utfärdade fakturor raderas aldrig', () => {
  for (const status of ['sent', 'paid'] as const) {
    it(`en faktura med status ${status} finns kvar efter deleteInvoice`, () => {
      const store = createLocalStore(memoryStorage());
      const n = createNext(store, status);
      tryDelete(store, `f-${n}`);
      expect(store.getInvoice(`f-${n}`)?.number).toBe(n);
      expect(store.listInvoices()).toHaveLength(1);
      expect(store.nextInvoiceNumber()).toBe(n + 1);
    });
  }

  it('radering av ett utkast påverkar inte utfärdade fakturor', () => {
    const store = createLocalStore(memoryStorage());
    const sent = createNext(store, 'sent');
    const draft = createNext(store, 'draft');
    store.deleteInvoice(`f-${draft}`);
    expect(store.listInvoices().map((i) => i.number)).toEqual([sent]);
  });

  it('ett utkast som har skickats kan inte längre raderas', () => {
    const store = createLocalStore(memoryStorage());
    const n = createNext(store, 'draft');
    const saved = store.getInvoice(`f-${n}`);
    if (!saved) throw new Error('Fakturan sparades inte');
    store.saveInvoice({ ...saved, status: 'sent' });
    tryDelete(store, `f-${n}`);
    expect(store.getInvoice(`f-${n}`)?.status).toBe('sent');
  });
});
