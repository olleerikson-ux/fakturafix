/**
 * Acceptanstester: lagring via createLocalStore.
 * Varje test använder en egen Storage i minnet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore, createOcr } from '../../src/core';
import { customer, invoice, memoryStorage, settings, storageKeys } from './helpers';

describe('createLocalStore: kunder', () => {
  it('är tom från början', () => {
    const store = createLocalStore(memoryStorage());
    expect(store.listCustomers()).toEqual([]);
    expect(store.getCustomer('finns-inte')).toBeUndefined();
  });

  it('sparar och läser en kund', () => {
    const store = createLocalStore(memoryStorage());
    const c = customer();
    store.saveCustomer(c);
    expect(store.getCustomer(c.id)).toEqual(c);
    expect(store.listCustomers()).toEqual([c]);
  });

  it('uppdaterar en kund med samma id i stället för att dubblera', () => {
    const store = createLocalStore(memoryStorage());
    store.saveCustomer(customer());
    store.saveCustomer(customer({ name: 'Testkund Nytt Namn AB' }));
    expect(store.listCustomers()).toHaveLength(1);
    expect(store.getCustomer('kund-1')?.name).toBe('Testkund Nytt Namn AB');
  });

  it('tar bort rätt kund', () => {
    const store = createLocalStore(memoryStorage());
    store.saveCustomer(customer({ id: 'a', name: 'Kund A' }));
    store.saveCustomer(customer({ id: 'b', name: 'Kund B' }));
    store.deleteCustomer('a');
    expect(store.getCustomer('a')).toBeUndefined();
    expect(store.listCustomers().map((c) => c.id)).toEqual(['b']);
  });
});

describe('createLocalStore: fakturor', () => {
  it('sparar, läser och uppdaterar fakturor', () => {
    const store = createLocalStore(memoryStorage());
    const inv = invoice();
    store.saveInvoice(inv);
    expect(store.getInvoice(inv.id)).toEqual(inv);

    store.saveInvoice({ ...inv, status: 'paid', paidDate: '2026-03-20' });
    expect(store.listInvoices()).toHaveLength(1);
    expect(store.getInvoice(inv.id)?.status).toBe('paid');
  });

  it('tar bort ett utkast', () => {
    const store = createLocalStore(memoryStorage());
    const draft = invoice({ status: 'draft', number: 0, ocr: '' });
    store.saveInvoice(draft);
    store.deleteInvoice(draft.id);
    expect(store.listInvoices()).toEqual([]);
  });
});

describe('createLocalStore: fakturanummer', () => {
  it('börjar på 1001', () => {
    expect(createLocalStore(memoryStorage()).nextInvoiceNumber()).toBe(1001);
  });

  it('räknar upp i följd', () => {
    const store = createLocalStore(memoryStorage());
    for (let i = 0; i < 3; i++) {
      const number = store.nextInvoiceNumber();
      store.saveInvoice(invoice({ id: `f-${number}`, number }));
    }
    expect(store.listInvoices().map((i) => i.number).sort()).toEqual([1001, 1002, 1003]);
    expect(store.nextInvoiceNumber()).toBe(1004);
  });

  it('ger högsta numret plus 1', () => {
    const store = createLocalStore(memoryStorage());
    store.saveInvoice(invoice({ id: 'x', number: 1001, ocr: '100164' }));
    store.saveInvoice(invoice({ id: 'y', number: 1002, ocr: createOcr(1002) }));
    expect(store.nextInvoiceNumber()).toBe(1003);
  });
});

describe('createLocalStore: inställningar', () => {
  it('saknas från början och kan sparas', () => {
    const store = createLocalStore(memoryStorage());
    expect(store.getSettings()).toBeUndefined();
    store.saveSettings(settings());
    expect(store.getSettings()).toEqual(settings());
  });
});

describe('createLocalStore: beständighet och format', () => {
  it('data finns kvar i ett nytt store på samma storage', () => {
    const storage = memoryStorage();
    const first = createLocalStore(storage);
    first.saveCustomer(customer());
    first.saveInvoice(invoice());
    first.saveSettings(settings());

    const second = createLocalStore(storage);
    expect(second.listCustomers()).toEqual([customer()]);
    expect(second.getInvoice('faktura-1')).toEqual(invoice());
    expect(second.getSettings()).toEqual(settings());
    expect(second.nextInvoiceNumber()).toBe(1002);
  });

  it('använder prefixet fakturafix: och sparar version 1', () => {
    const storage = memoryStorage();
    const store = createLocalStore(storage);
    store.saveCustomer(customer());
    store.saveInvoice(invoice());
    store.saveSettings(settings());

    const keys = storageKeys(storage);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('fakturafix:'))).toBe(true);
    expect(storage.getItem('fakturafix:version')).toBe('1');
  });
});

describe('createLocalStore: trasig data', () => {
  it('behandlar trasig JSON som tom data utan att krascha', () => {
    const storage = memoryStorage();
    const store = createLocalStore(storage);
    store.saveCustomer(customer());
    store.saveInvoice(invoice());
    store.saveSettings(settings());

    for (const key of storageKeys(storage)) {
      if (key !== 'fakturafix:version') storage.setItem(key, '{trasig json');
    }

    const broken = createLocalStore(storage);
    expect(broken.listCustomers()).toEqual([]);
    expect(broken.listInvoices()).toEqual([]);
    expect(broken.getSettings()).toBeUndefined();
    expect(broken.nextInvoiceNumber()).toBe(1001);
  });

  it('klarar JSON av fel typ', () => {
    const storage = memoryStorage();
    const store = createLocalStore(storage);
    store.saveCustomer(customer());
    store.saveInvoice(invoice());
    for (const key of storageKeys(storage)) {
      if (key !== 'fakturafix:version') storage.setItem(key, '"en sträng"');
    }
    const broken = createLocalStore(storage);
    expect(() => broken.listCustomers()).not.toThrow();
    expect(() => broken.listInvoices()).not.toThrow();
    expect(() => broken.nextInvoiceNumber()).not.toThrow();
  });

  it('kan spara igen efter trasig data', () => {
    const storage = memoryStorage();
    createLocalStore(storage).saveCustomer(customer());
    for (const key of storageKeys(storage)) {
      if (key !== 'fakturafix:version') storage.setItem(key, 'null{');
    }
    const store = createLocalStore(storage);
    store.saveCustomer(customer({ id: 'ny' }));
    expect(store.getCustomer('ny')).toBeDefined();
  });
});

describe('createLocalStore: standardlagring', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('använder window.localStorage om ingen storage skickas in', () => {
    const store = createLocalStore();
    store.saveCustomer(customer());
    expect(storageKeys(window.localStorage).some((k) => k.startsWith('fakturafix:'))).toBe(true);
  });
});

describe('createLocalStore: blockerad lagring (SecurityError)', () => {
  const securityError = () => new DOMException('Åtkomst nekad', 'SecurityError');

  function blockedStorage(): Storage {
    return {
      get length(): number {
        throw securityError();
      },
      clear: () => {
        throw securityError();
      },
      getItem: () => {
        throw securityError();
      },
      key: () => {
        throw securityError();
      },
      removeItem: () => {
        throw securityError();
      },
      setItem: () => {
        throw securityError();
      },
    };
  }

  it('kraschar inte när storage kastar SecurityError vid läsning', () => {
    const store = createLocalStore(blockedStorage());
    expect(store.listCustomers()).toEqual([]);
    expect(store.listInvoices()).toEqual([]);
    expect(store.getCustomer('kund-1')).toBeUndefined();
    expect(store.getSettings()).toBeUndefined();
    expect(store.nextInvoiceNumber()).toBe(1001);
  });

  it('kraschar inte när window.localStorage inte går att komma åt', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw securityError();
    });
    try {
      const store = createLocalStore();
      expect(store.listCustomers()).toEqual([]);
      expect(store.getSettings()).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
